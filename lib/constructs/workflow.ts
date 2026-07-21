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
  bedrockModelId: string;
  notificationFromAddress: string;
  finalUrlExpirySeconds: number;
}

/**
 * 短編小説生成ワークフローの中核となるStep Functions（Standard）ステートマシンと、
 * それが呼び出す各Lambda関数（プラン生成・承認待ち・章生成・改訂プラン作成・仕上げ）を定義する。
 *
 * ワークフロー全体を通じて `storyId` をトップレベルに保持し、各タスクの結果は
 * `resultPath` で個別のキーにマージする（Lambdaの戻り値で `$` 全体を上書きしない）ことで、
 * 承認/拒否ループや改訂ループをシンプルなJSONPathの組み合わせで表現している。
 */
export class NovelWorkflow extends Construct {
  readonly stateMachine: sfn.StateMachine;

  constructor(scope: Construct, id: string, props: NovelWorkflowProps) {
    super(scope, id);

    const modelArn = this.foundationModelArn(props.bedrockModelId);
    const bedrockInvokeStatement = new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      resources: [modelArn],
    });
    const sesSendStatement = new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    });

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
      timeout: Duration.minutes(5),
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

    const createRevisionPlanFn = createHandlerFunction(this, 'CreateRevisionPlanFunction', {
      entry: 'createRevisionPlan.ts',
      description: '最終承認拒否のフィードバックから改訂対象の章を決定する',
      timeout: Duration.seconds(60),
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        BEDROCK_MODEL_ID: props.bedrockModelId,
      },
    });
    props.storyTable.grantReadWriteData(createRevisionPlanFn);
    createRevisionPlanFn.addToRolePolicy(bedrockInvokeStatement);

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
      generatePlanFn,
      requestApprovalFn,
      generateChapterFn,
      createRevisionPlanFn,
      finalizeNovelFn,
    });
  }

  private buildStateMachine(fns: {
    generatePlanFn: NodejsFunction;
    requestApprovalFn: NodejsFunction;
    generateChapterFn: NodejsFunction;
    createRevisionPlanFn: NodejsFunction;
    finalizeNovelFn: NodejsFunction;
  }): sfn.StateMachine {
    const { generatePlanFn, requestApprovalFn, generateChapterFn, createRevisionPlanFn, finalizeNovelFn } =
      fns;

    const generatePlan = new tasks.LambdaInvoke(this, 'GeneratePlan', {
      lambdaFunction: generatePlanFn,
      payloadResponseOnly: true,
      resultPath: '$.plan',
    });

    const requestPlanApproval = new tasks.LambdaInvoke(this, 'RequestPlanApproval', {
      lambdaFunction: requestApprovalFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        stage: 'plan',
        taskToken: sfn.JsonPath.taskToken,
      }),
      resultPath: '$.planDecision',
    });

    const mergePlanFeedback = new sfn.Pass(this, 'MergePlanFeedback', {
      comment: '拒否フィードバックを反映し、次のGeneratePlan呼び出し用に状態をリセットする',
      parameters: {
        'storyId.$': '$.storyId',
        'feedback.$': '$.planDecision.feedback',
      },
    });

    const generateChaptersMap = new sfn.Map(this, 'GenerateChapters', {
      itemsPath: '$.plan.chapterIndexes',
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
      itemSelector: {
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$$.Map.Item.Value'),
      },
    });
    generateChaptersMap.itemProcessor(
      new tasks.LambdaInvoke(this, 'GenerateChapter', {
        lambdaFunction: generateChapterFn,
        payloadResponseOnly: true,
        resultPath: sfn.JsonPath.DISCARD,
      }),
    );

    const requestFinalApproval = new tasks.LambdaInvoke(this, 'RequestFinalApproval', {
      lambdaFunction: requestApprovalFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        stage: 'final',
        taskToken: sfn.JsonPath.taskToken,
      }),
      resultPath: '$.finalDecision',
    });

    const createRevisionPlan = new tasks.LambdaInvoke(this, 'CreateRevisionPlan', {
      lambdaFunction: createRevisionPlanFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        feedback: sfn.JsonPath.stringAt('$.finalDecision.feedback'),
      }),
      resultPath: '$.revision',
    });

    const reviseChaptersMap = new sfn.Map(this, 'ReviseChapters', {
      itemsPath: '$.revision.chapterIndexes',
      maxConcurrency: 1,
      resultPath: sfn.JsonPath.DISCARD,
      itemSelector: {
        storyId: sfn.JsonPath.stringAt('$.storyId'),
        chapterIndex: sfn.JsonPath.numberAt('$$.Map.Item.Value'),
      },
    });
    reviseChaptersMap.itemProcessor(
      new tasks.LambdaInvoke(this, 'ReviseChapter', {
        lambdaFunction: generateChapterFn,
        payloadResponseOnly: true,
        resultPath: sfn.JsonPath.DISCARD,
      }),
    );

    const finalize = new tasks.LambdaInvoke(this, 'Finalize', {
      lambdaFunction: finalizeNovelFn,
      payloadResponseOnly: true,
      resultPath: sfn.JsonPath.DISCARD,
    });

    const succeed = new sfn.Succeed(this, 'NovelCompleted');

    const planApprovedChoice = new sfn.Choice(this, 'PlanApproved?')
      .when(sfn.Condition.booleanEquals('$.planDecision.approved', true), generateChaptersMap)
      .otherwise(mergePlanFeedback);

    const finalApprovedChoice = new sfn.Choice(this, 'FinalApproved?')
      .when(sfn.Condition.booleanEquals('$.finalDecision.approved', true), finalize.next(succeed))
      .otherwise(createRevisionPlan.next(reviseChaptersMap).next(requestFinalApproval));

    mergePlanFeedback.next(generatePlan);
    generateChaptersMap.next(requestFinalApproval);

    const definition = generatePlan.next(requestPlanApproval).next(planApprovedChoice);
    requestFinalApproval.next(finalApprovedChoice);

    return new sfn.StateMachine(this, 'StateMachine', {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.hours(6),
      logs: {
        destination: new logs.LogGroup(this, 'StateMachineLogGroup', {
          retention: logs.RetentionDays.ONE_MONTH,
        }),
        level: sfn.LogLevel.ALL,
      },
      tracingEnabled: true,
    });
  }

  private foundationModelArn(modelId: string): string {
    const stack = Stack.of(this);
    return `arn:${stack.partition}:bedrock:${stack.region}::foundation-model/${modelId}`;
  }
}
