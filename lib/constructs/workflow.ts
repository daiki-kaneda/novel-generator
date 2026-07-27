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
 * それが呼び出す各Lambda関数を定義する。
 */
export class NovelWorkflow extends Construct {
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: NovelWorkflowProps) {
    super(scope, id);

    const stack = Stack.of(this);
    const bedrockInvokeStatement = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
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
      timeout: Duration.seconds(120),
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
      description: '1章分の本文を生成し、TKG更新と未来アウトライン再整合を行う',
      timeout: Duration.minutes(15),
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

    const compensateChapterFn = createHandlerFunction(this, 'CompensateChapterFailureFunction', {
      entry: 'compensateChapterFailure.ts',
      description: '章生成失敗時にS3/TKG/章状態を補償ロールバックする',
      timeout: Duration.seconds(60),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        CONTENT_BUCKET_NAME: props.contentBucket.bucketName,
      },
    });
    props.storyTable.grantReadWriteData(compensateChapterFn);
    props.contentBucket.grantReadWrite(compensateChapterFn);

    const preparePartialRewriteFn = createHandlerFunction(this, 'PreparePartialRewriteFunction', {
      entry: 'preparePartialRewrite.ts',
      description: '最終拒否時に指定章以降のみ再生成できるよう状態を巻き戻す',
      timeout: Duration.seconds(60),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        CONTENT_BUCKET_NAME: props.contentBucket.bucketName,
      },
    });
    props.storyTable.grantReadWriteData(preparePartialRewriteFn);
    props.contentBucket.grantReadWrite(preparePartialRewriteFn);

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
      compensateChapterFn,
      preparePartialRewriteFn,
      finalizeNovelFn,
    });
  }

  private buildStateMachine(fns: {
    generateMetadataFn: NodejsFunction;
    generatePlanFn: NodejsFunction;
    requestApprovalFn: NodejsFunction;
    generateChapterFn: NodejsFunction;
    compensateChapterFn: NodejsFunction;
    preparePartialRewriteFn: NodejsFunction;
    finalizeNovelFn: NodejsFunction;
  }): sfn.StateMachine {
    const {
      generateMetadataFn,
      generatePlanFn,
      requestApprovalFn,
      generateChapterFn,
      compensateChapterFn,
      preparePartialRewriteFn,
      finalizeNovelFn,
    } = fns;

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

    const chapterDone = new sfn.Pass(this, 'ChapterDone');

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

    const compensateChapter = new tasks.LambdaInvoke(this, 'CompensateChapterFailure', {
      lambdaFunction: compensateChapterFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$.chapterIndex'),
        error: sfn.JsonPath.objectAt('$.error'),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });

    const incrementChapterAttempt = new sfn.Pass(this, 'IncrementChapterAttempt', {
      parameters: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$.chapterIndex',
        'requireChapterApproval.$': '$.requireChapterApproval',
        revisionFeedback: '',
        'attempt.$': 'States.MathAdd($.attempt, 1)',
      },
    });

    const requestChapterRecovery = requestApprovalTask(
      'RequestChapterRecovery',
      'chapter',
      '$.chapterDecision',
      { includeChapterIndex: true },
    );

    const prepareRecoveryRevision = new sfn.Pass(this, 'PrepareRecoveryRevision', {
      parameters: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$.chapterIndex',
        'requireChapterApproval.$': '$.requireChapterApproval',
        'revisionFeedback.$': '$.chapterDecision.feedback',
        attempt: 0,
      },
    });

    const recoveryApprovedChoice = new sfn.Choice(this, 'RecoveryApproved?')
      .when(sfn.Condition.booleanEquals('$.chapterDecision.approved', true), chapterDone)
      .otherwise(prepareRecoveryRevision);

    const retryOrRecover = new sfn.Choice(this, 'RetryChapterOrRecover?')
      .when(sfn.Condition.numberLessThan('$.attempt', 2), generateChapter)
      .otherwise(requestChapterRecovery);

    generateChapter.addCatch(compensateChapter, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });
    compensateChapter.next(incrementChapterAttempt);
    incrementChapterAttempt.next(retryOrRecover);
    requestChapterRecovery.next(recoveryApprovedChoice);
    prepareRecoveryRevision.next(generateChapter);

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
        attempt: 0,
      },
    });

    const chapterApprovedChoice = new sfn.Choice(this, 'ChapterApproved?')
      .when(sfn.Condition.booleanEquals('$.chapterDecision.approved', true), chapterDone)
      .otherwise(prepareChapterRevision);

    const chapterApprovalGate = new sfn.Choice(this, 'RequireChapterApproval?')
      .when(sfn.Condition.booleanEquals('$.requireChapterApproval', true), requestChapterApproval)
      .otherwise(chapterDone);

    generateChapter.next(chapterApprovalGate);
    requestChapterApproval.next(chapterApprovedChoice);
    prepareChapterRevision.next(generateChapter);

    const chapterItemSelector = {
      'storyId.$': '$.storyId',
      'chapterIndex.$': '$$.Map.Item.Value',
      'requireChapterApproval.$': '$.plan.requireChapterApproval',
      revisionFeedback: '',
      attempt: 0,
    };

    const generateChaptersMap = new sfn.Map(this, 'GenerateChapters', {
      itemsPath: '$.plan.chapterIndexes',
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
      itemSelector: chapterItemSelector,
    });
    generateChaptersMap.itemProcessor(generateChapter);

    const rewriteChaptersMap = new sfn.Map(this, 'RewriteChapters', {
      itemsPath: '$.rewrite.chapterIndexes',
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
      itemSelector: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$$.Map.Item.Value',
        'requireChapterApproval.$': '$.rewrite.requireChapterApproval',
        'revisionFeedback.$': '$.rewrite.revisionFeedback',
        attempt: 0,
      },
    });
    // Map は同じプロセッサ鎖を共有できないため、Rewrite 用に同等の開始点として generateChapter を使う。
    // CDK では同一 State を複数 Map の processor にできないので、書き換え用の並列鎖を構築する。
    const rewriteGenerateChapter = new tasks.LambdaInvoke(this, 'RewriteGenerateChapter', {
      lambdaFunction: generateChapterFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$.chapterIndex'),
        revisionFeedback: sfn.JsonPath.stringAt('$.revisionFeedback'),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });
    const rewriteCompensate = new tasks.LambdaInvoke(this, 'RewriteCompensateChapterFailure', {
      lambdaFunction: compensateChapterFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$.chapterIndex'),
        error: sfn.JsonPath.objectAt('$.error'),
      }),
      resultPath: sfn.JsonPath.DISCARD,
    });
    const rewriteIncrement = new sfn.Pass(this, 'RewriteIncrementChapterAttempt', {
      parameters: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$.chapterIndex',
        'requireChapterApproval.$': '$.requireChapterApproval',
        'revisionFeedback.$': '$.revisionFeedback',
        'attempt.$': 'States.MathAdd($.attempt, 1)',
      },
    });
    const rewriteChapterDone = new sfn.Pass(this, 'RewriteChapterDone');
    const rewriteRequestRecovery = requestApprovalTask(
      'RewriteRequestChapterRecovery',
      'chapter',
      '$.chapterDecision',
      { includeChapterIndex: true },
    );
    const rewritePrepareRecovery = new sfn.Pass(this, 'RewritePrepareRecoveryRevision', {
      parameters: {
        'storyId.$': '$.storyId',
        'chapterIndex.$': '$.chapterIndex',
        'requireChapterApproval.$': '$.requireChapterApproval',
        'revisionFeedback.$': '$.chapterDecision.feedback',
        attempt: 0,
      },
    });
    const rewriteRecoveryChoice = new sfn.Choice(this, 'RewriteRecoveryApproved?')
      .when(sfn.Condition.booleanEquals('$.chapterDecision.approved', true), rewriteChapterDone)
      .otherwise(rewritePrepareRecovery);
    const rewriteRetryOrRecover = new sfn.Choice(this, 'RewriteRetryChapterOrRecover?')
      .when(sfn.Condition.numberLessThan('$.attempt', 2), rewriteGenerateChapter)
      .otherwise(rewriteRequestRecovery);

    rewriteGenerateChapter.addCatch(rewriteCompensate, {
      errors: ['States.ALL'],
      resultPath: '$.error',
    });
    rewriteCompensate.next(rewriteIncrement);
    rewriteIncrement.next(rewriteRetryOrRecover);
    rewriteRequestRecovery.next(rewriteRecoveryChoice);
    rewritePrepareRecovery.next(rewriteGenerateChapter);
    rewriteGenerateChapter.next(rewriteChapterDone);
    rewriteChaptersMap.itemProcessor(rewriteGenerateChapter);

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

    const mergeFinalFeedback = new sfn.Pass(this, 'MergeFinalFeedback', {
      comment: '最終拒否は指定章以降の部分再生成へ進む（フルリライトしない）',
      parameters: {
        'storyId.$': '$.storyId',
        'feedback.$': '$.finalDecision.feedback',
        'rewriteFromChapterIndex.$': '$.finalDecision.rewriteFromChapterIndex',
        'requireChapterApproval.$': '$.plan.requireChapterApproval',
      },
    });

    const preparePartialRewrite = new tasks.LambdaInvoke(this, 'PreparePartialRewrite', {
      lambdaFunction: preparePartialRewriteFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        rewriteFromChapterIndex: sfn.JsonPath.numberAt('$.rewriteFromChapterIndex'),
        feedback: sfn.JsonPath.stringAt('$.feedback'),
      }),
      resultPath: '$.rewrite',
    });

    const afterRewriteKeepContext = new sfn.Pass(this, 'AfterRewriteKeepContext', {
      parameters: {
        'storyId.$': '$.storyId',
        'rewrite.$': '$.rewrite',
        plan: {
          'requireChapterApproval.$': '$.rewrite.requireChapterApproval',
        },
      },
    });

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

    const finalApprovalGate = new sfn.Choice(this, 'RequireFinalApproval?')
      .when(sfn.Condition.booleanEquals('$.plan.requireChapterApproval', false), requestFinalApproval)
      .otherwise(finalize);

    const finalApprovedChoice = new sfn.Choice(this, 'FinalApproved?')
      .when(sfn.Condition.booleanEquals('$.finalDecision.approved', true), finalize)
      .otherwise(mergeFinalFeedback);

    mergeMetadataFeedback.next(generateMetadata);
    mergePlanFeedback.next(generatePlan);
    mergeFinalFeedback.next(preparePartialRewrite);
    preparePartialRewrite.next(afterRewriteKeepContext);
    afterRewriteKeepContext.next(rewriteChaptersMap);
    rewriteChaptersMap.next(finalApprovalGate);

    generateChaptersMap.next(finalApprovalGate);
    requestMetadataApproval.next(metadataApprovedChoice);
    requestPlanApproval.next(planApprovedChoice);
    requestFinalApproval.next(finalApprovedChoice);

    generateMetadata.next(metadataApprovalGate);
    generatePlan.next(planApprovalGate);

    const unwrapPipeBatch = new sfn.Pass(this, 'UnwrapPipeBatch', {
      comment: 'Pipeからの [{ storyId }] を { storyId } に展開する',
      inputPath: '$[0]',
    });

    const definition = unwrapPipeBatch.next(generateMetadata);

    return new sfn.StateMachine(this, 'StateMachine', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
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
