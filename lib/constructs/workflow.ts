import { Duration, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { createHandlerFunction } from './nodeFunction';

export interface NovelWorkflowProps {
  storyTable: dynamodb.ITable;
  contentBucket: s3.IBucket;
  /** Bedrock Converse に渡す推論プロファイル / モデル ID */
  bedrockModelId: string;
  /** IAM で許可する基盤モデル ID（推論プロファイルのルーティング先） */
  bedrockFoundationModelId: string;
  /** 基盤モデルを許可するリージョン（JP プロファイルなら東京・大阪） */
  bedrockFoundationModelRegions: readonly string[];
  notificationFromAddress: string;
  finalUrlExpirySeconds: number;
}

/**
 * 小説生成ワークフローの中核となるStep Functions（Standard）ステートマシンと、
 * それが呼び出す各Lambda関数（メタデータ生成・プラン生成・承認待ち・章生成・仕上げ）を定義する。
 *
 * ワークフロー全体を通じて `storyId` をトップレベルに保持し、各タスクの結果は
 * `resultPath` で個別のキーにマージする（Lambdaの戻り値で `$` 全体を上書きしない）ことで、
 * 承認/拒否ループをシンプルなJSONPathの組み合わせで表現している。
 */
export class NovelWorkflow extends Construct {
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: NovelWorkflowProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const bedrockInvokeStatement = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      // 推論プロファイル ARN + ルーティング先 foundation-model ARN（JP は東京・大阪）
      resources: [
        `arn:${stack.partition}:bedrock:${stack.region}:${stack.account}:inference-profile/${props.bedrockModelId}`,
        ...props.bedrockFoundationModelRegions.map(
          (r) =>
            `arn:${stack.partition}:bedrock:${r}::foundation-model/${props.bedrockFoundationModelId}`,
        ),
      ],
    });
    const sesSendStatement = new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });

    const generateMetadataFn = createHandlerFunction(this, 'GenerateMetadataFunction', {
      entry: 'generateMetadata.ts',
      description: '物語設定書（登場人物・世界観・時間軸・一貫性制約）を生成/再生成する',
      timeout: Duration.seconds(90),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
    });
    props.storyTable.grantReadWriteData(generateMetadataFn);
    generateMetadataFn.addToRolePolicy(bedrockInvokeStatement);

    const generatePlanFn = createHandlerFunction(this, 'GeneratePlanFunction', {
      entry: 'generatePlan.ts',
      description: 'プラン（概要・テーマ・登場人物・章構成）を生成/再生成する',
      timeout: Duration.seconds(90),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
    });
    props.storyTable.grantReadWriteData(generatePlanFn);
    generatePlanFn.addToRolePolicy(bedrockInvokeStatement);

    const requestApprovalFn = createHandlerFunction(this, 'RequestApprovalFunction', {
      entry: 'requestApproval.ts',
      description: 'taskTokenを保存し承認待ち状態に入る',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadWriteData(requestApprovalFn);

    const generateChapterFn = createHandlerFunction(this, 'GenerateChapterFunction', {
      entry: 'generateChapter.ts',
      description: '1章分の本文を生成し、次章用の要約を作成する',
      timeout: Duration.minutes(10),
      memorySize: 1024,
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        CONTENT_BUCKET_NAME: props.contentBucket.bucketName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
    });
    props.storyTable.grantReadWriteData(generateChapterFn);
    props.contentBucket.grantReadWrite(generateChapterFn);
    generateChapterFn.addToRolePolicy(bedrockInvokeStatement);

    const finalizeNovelFn = createHandlerFunction(this, 'FinalizeNovelFunction', {
      entry: 'finalizeNovel.ts',
      description: '全章を結合して最終テキストを保存し、署名付きURLをメール通知する',
      timeout: Duration.seconds(60),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        CONTENT_BUCKET_NAME: props.contentBucket.bucketName,
        NOTIFICATION_FROM_ADDRESS: props.notificationFromAddress,
        FINAL_URL_EXPIRY_SECONDS: String(props.finalUrlExpirySeconds),
      },
    });
    props.storyTable.grantReadWriteData(finalizeNovelFn);
    props.contentBucket.grantReadWrite(finalizeNovelFn);
    finalizeNovelFn.addToRolePolicy(sesSendStatement);

    this.stateMachine = this.buildStateMachine({
      generateMetadataFn,
      generatePlanFn,
      requestApprovalFn,
      generateChapterFn,
      finalizeNovelFn,
    });
  }

  private buildStateMachine(fns: {
    generateMetadataFn: NodejsFunction;
    generatePlanFn: NodejsFunction;
    requestApprovalFn: NodejsFunction;
    generateChapterFn: NodejsFunction;
    finalizeNovelFn: NodejsFunction;
  }): sfn.StateMachine {
    const {
      generateMetadataFn,
      generatePlanFn,
      requestApprovalFn,
      generateChapterFn,
      finalizeNovelFn,
    } = fns;

    /** 承認待ちタスク（コールバックトークン保存）を共通生成する。 */
    const requestApprovalTask = (
      id: string,
      stage: 'metadata' | 'plan' | 'chapter' | 'final',
      resultPath: string,
      options?: { includeChapterIndex?: boolean },
    ) =>
      new tasks.LambdaInvoke(this, id, {
        lambdaFunction: requestApprovalFn,
        integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
        payload: sfn.TaskInput.fromObject({
          storyId: sfn.JsonPath.stringAt('$.storyId'),
          stage,
          ...(options?.includeChapterIndex
            ? { chapterIndex: sfn.JsonPath.numberAt('$.chapterIndex') }
            : {}),
          taskToken: sfn.JsonPath.taskToken,
        }),
        resultPath,
      });

    const generateMetadata = new tasks.LambdaInvoke(this, 'GenerateMetadata', {
      lambdaFunction: generateMetadataFn,
      payloadResponseOnly: true,
      resultPath: '$.metadata',
    });

    const requestMetadataApproval = requestApprovalTask(
      'RequestMetadataApproval',
      'metadata',
      '$.metadataDecision',
    );

    const mergeMetadataFeedback = new sfn.Pass(this, 'MergeMetadataFeedback', {
      comment: 'メタデータ拒否フィードバックを反映し、次のGenerateMetadata呼び出し用に状態をリセットする',
      parameters: {
        'storyId.$': '$.storyId',
        'feedback.$': '$.metadataDecision.feedback',
      },
    });

    const generatePlan = new tasks.LambdaInvoke(this, 'GeneratePlan', {
      lambdaFunction: generatePlanFn,
      payloadResponseOnly: true,
      resultPath: '$.plan',
    });

    const requestPlanApproval = requestApprovalTask(
      'RequestPlanApproval',
      'plan',
      '$.planDecision',
    );

    const mergePlanFeedback = new sfn.Pass(this, 'MergePlanFeedback', {
      comment: 'プラン拒否フィードバックを反映し、次のGeneratePlan呼び出し用に状態をリセットする',
      parameters: {
        'storyId.$': '$.storyId',
        'feedback.$': '$.planDecision.feedback',
      },
    });

    const mergeFinalFeedback = new sfn.Pass(this, 'MergeFinalFeedback', {
      comment: '最終承認拒否はPlanフィードバックとして扱い、全章を再生成する',
      parameters: {
        'storyId.$': '$.storyId',
        'feedback.$': '$.finalDecision.feedback',
      },
    });

    const generateChapter = new tasks.LambdaInvoke(this, 'GenerateChapter', {
      lambdaFunction: generateChapterFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$.chapterIndex'),
        revisionFeedback: sfn.JsonPath.stringAt('$.revisionFeedback'),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const requestChapterApproval = requestApprovalTask(
      'RequestChapterApproval',
      'chapter',
      '$.chapterDecision',
      { includeChapterIndex: true },
    );

    const prepareChapterRevision = new sfn.Pass(this, 'PrepareChapterRevision', {
      comment: '章拒否フィードバックを次のGenerateChapter呼び出し用に載せる',
      parameters: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$.chapterIndex',
        'requireChapterApproval.$': '$.requireChapterApproval',
        'revisionFeedback.$': '$.chapterDecision.feedback',
      },
    });

    const chapterDone = new sfn.Pass(this, 'ChapterDone');

    const chapterApprovedChoice = new sfn.Choice(this, 'ChapterApproved?')
      .when(sfn.Condition.booleanEquals('$.chapterDecision.approved', true), chapterDone)
      .otherwise(prepareChapterRevision);

    const chapterApprovalGate = new sfn.Choice(this, 'RequireChapterApproval?')
      .when(sfn.Condition.booleanEquals('$.requireChapterApproval', true), requestChapterApproval)
      .otherwise(chapterDone);

    generateChapter.next(chapterApprovalGate);
    requestChapterApproval.next(chapterApprovedChoice);
    // 拒否時はフィードバックを載せて同じ章の生成に戻る（順番は戻れない）
    prepareChapterRevision.next(generateChapter);

    const generateChaptersMap = new sfn.Map(this, 'GenerateChapters', {
      itemsPath: '$.plan.chapterIndexes',
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
      itemSelector: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$$.Map.Item.Value',
        'requireChapterApproval.$': '$.plan.requireChapterApproval',
        revisionFeedback: '',
      },
    });
    generateChaptersMap.itemProcessor(generateChapter);

    const requestFinalApproval = requestApprovalTask(
      'RequestFinalApproval',
      'final',
      '$.finalDecision',
    );

    const finalize = new tasks.LambdaInvoke(this, 'Finalize', {
      lambdaFunction: finalizeNovelFn,
      payloadResponseOnly: true,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const succeed = new sfn.Succeed(this, 'NovelCompleted');
    finalize.next(succeed);

    const planApprovedChoice = new sfn.Choice(this, 'PlanApproved?')
      .when(sfn.Condition.booleanEquals('$.planDecision.approved', true), generateChaptersMap)
      .otherwise(mergePlanFeedback);

    const planApprovalGate = new sfn.Choice(this, 'RequirePlanApproval?')
      .when(sfn.Condition.booleanEquals('$.plan.requirePlanApproval', true), requestPlanApproval)
      .otherwise(generateChaptersMap);

    const metadataApprovedChoice = new sfn.Choice(this, 'MetadataApproved?')
      .when(sfn.Condition.booleanEquals('$.metadataDecision.approved', true), generatePlan)
      .otherwise(mergeMetadataFeedback);

    const metadataApprovalGate = new sfn.Choice(this, 'RequireMetadataApproval?')
      .when(
        sfn.Condition.booleanEquals('$.metadata.requireMetadataApproval', true),
        requestMetadataApproval,
      )
      .otherwise(generatePlan);

    const finalApprovedChoice = new sfn.Choice(this, 'FinalApproved?')
      .when(sfn.Condition.booleanEquals('$.finalDecision.approved', true), finalize)
      .otherwise(mergeFinalFeedback);

    // 章承認が無効な場合のみ最終承認を必須にする
    const finalApprovalGate = new sfn.Choice(this, 'RequireFinalApproval?')
      .when(sfn.Condition.booleanEquals('$.plan.requireChapterApproval', false), requestFinalApproval)
      .otherwise(finalize);

    mergeMetadataFeedback.next(generateMetadata);
    mergePlanFeedback.next(generatePlan);
    mergeFinalFeedback.next(generatePlan);
    generateChaptersMap.next(finalApprovalGate);
    requestMetadataApproval.next(metadataApprovedChoice);
    requestPlanApproval.next(planApprovedChoice);
    requestFinalApproval.next(finalApprovedChoice);

    generateMetadata.next(metadataApprovalGate);
    generatePlan.next(planApprovalGate);

    // EventBridge Pipes(SQS)は batchSize=1 でも変換結果を配列で渡すため、先頭要素を取り出す
    const unwrapPipeBatch = new sfn.Pass(this, 'UnwrapPipeBatch', {
      comment: 'Pipeからの [{ storyId }] を { storyId } に展開する',
      inputPath: '$[0]',
    });

    const definition = unwrapPipeBatch.next(generateMetadata);

    return new sfn.StateMachine(this, 'StateMachine', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      // 章ごとの人間承認が挟まるため、タイムアウトに余裕を持たせる
      timeout: Duration.days(7),
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
    });
  }
}
