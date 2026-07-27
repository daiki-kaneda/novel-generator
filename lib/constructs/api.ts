import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { HttpApi, HttpMethod, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Construct } from 'constructs';
import { createHandlerFunction } from './nodeFunction';

export interface NovelApiProps {
  storyTable: dynamodb.ITable;
  contentBucket: s3.IBucket;
  storyRequestQueueUrl: string;
  storyRequestQueueArn: string;
  finalUrlExpirySeconds: number;
  stateMachine: sfn.IStateMachine;
}

/**
 * ユーザー操作（物語の送信、状態確認、メタデータ/プラン/章/最終原稿の承認・拒否、
 * 完成後の部分改訂開始、章本文取得）を受け付ける HTTP API Gatewayと、
 * それぞれに対応するLambda関数を定義する。
 */
export class NovelApi extends Construct {
  readonly httpApi: HttpApi;

  constructor(scope: Construct, id: string, props: NovelApiProps) {
    super(scope, id);

    // Step FunctionsのwaitForTaskTokenに対する決定送信は、taskToken自体が認可の実体であり、
    // IAM側でステートマシンやトークン単位にリソースを絞ることができないため`*`を許可する。
    const sendTaskDecisionStatement = new iam.PolicyStatement({
      actions: ['states:SendTaskSuccess', 'states:SendTaskFailure'],
      resources: ['*'],
    });

    const submitStoryFn = createHandlerFunction(this, 'SubmitStoryFunction', {
      entry: 'submitStory.ts',
      description: 'POST /stories: 物語の概要・テーマ・登場人物を受け付ける',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        STORY_REQUEST_QUEUE_URL: props.storyRequestQueueUrl,
      },
    });
    props.storyTable.grantReadWriteData(submitStoryFn);
    submitStoryFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [props.storyRequestQueueArn],
      }),
    );

    const getStoryStatusFn = createHandlerFunction(this, 'GetStoryStatusFunction', {
      entry: 'getStoryStatus.ts',
      description: 'GET /stories/{storyId}: 物語の進行状況を取得する',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadData(getStoryStatusFn);

    const getChapterContentFn = createHandlerFunction(this, 'GetChapterContentFunction', {
      entry: 'getChapterContent.ts',
      description: 'GET /stories/{storyId}/chapters/{chapterIndex}/content: 章本文URLを取得する',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        CONTENT_BUCKET_NAME: props.contentBucket.bucketName,
        FINAL_URL_EXPIRY_SECONDS: String(props.finalUrlExpirySeconds),
      },
    });
    props.storyTable.grantReadData(getChapterContentFn);
    props.contentBucket.grantRead(getChapterContentFn);

    const metadataDecisionFn = createHandlerFunction(this, 'MetadataDecisionFunction', {
      entry: 'metadataDecision.ts',
      description: 'POST /stories/{storyId}/metadata/decision: メタデータ（設定書）の承認/拒否',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadWriteData(metadataDecisionFn);
    metadataDecisionFn.addToRolePolicy(sendTaskDecisionStatement);

    const planDecisionFn = createHandlerFunction(this, 'PlanDecisionFunction', {
      entry: 'planDecision.ts',
      description: 'POST /stories/{storyId}/plan/decision: プランの承認/拒否',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadWriteData(planDecisionFn);
    planDecisionFn.addToRolePolicy(sendTaskDecisionStatement);

    const chapterDecisionFn = createHandlerFunction(this, 'ChapterDecisionFunction', {
      entry: 'chapterDecision.ts',
      description: 'POST /stories/{storyId}/chapters/{chapterIndex}/decision: 章の承認/拒否',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadWriteData(chapterDecisionFn);
    chapterDecisionFn.addToRolePolicy(sendTaskDecisionStatement);

    const finalDecisionFn = createHandlerFunction(this, 'FinalDecisionFunction', {
      entry: 'finalDecision.ts',
      description: 'POST /stories/{storyId}/final/decision: 最終原稿の承認/拒否',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
      },
    });
    props.storyTable.grantReadWriteData(finalDecisionFn);
    finalDecisionFn.addToRolePolicy(sendTaskDecisionStatement);

    const startRevisionFn = createHandlerFunction(this, 'StartRevisionFunction', {
      entry: 'startRevision.ts',
      description: 'POST /stories/{storyId}/revisions: 完成済み物語の部分改訂を開始する',
      environment: {
        STORY_TABLE_NAME: props.storyTable.tableName,
        STATE_MACHINE_ARN: props.stateMachine.stateMachineArn,
      },
    });
    props.storyTable.grantReadWriteData(startRevisionFn);
    props.stateMachine.grantStartExecution(startRevisionFn);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      description: '小説生成ワークフロー API',
      corsPreflight: {
        allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST],
        allowOrigins: ['*'],
        allowHeaders: ['content-type'],
      },
    });

    this.httpApi.addRoutes({
      path: '/stories',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('SubmitStoryIntegration', submitStoryFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetStoryStatusIntegration', getStoryStatusFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/chapters/{chapterIndex}/content',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('GetChapterContentIntegration', getChapterContentFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/metadata/decision',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('MetadataDecisionIntegration', metadataDecisionFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/plan/decision',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('PlanDecisionIntegration', planDecisionFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/chapters/{chapterIndex}/decision',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('ChapterDecisionIntegration', chapterDecisionFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/final/decision',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('FinalDecisionIntegration', finalDecisionFn),
    });
    this.httpApi.addRoutes({
      path: '/stories/{storyId}/revisions',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('StartRevisionIntegration', startRevisionFn),
    });
  }
}
