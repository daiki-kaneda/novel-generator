import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { NovelStorage } from './constructs/storage';
import { NovelWorkflow } from './constructs/workflow';
import { NovelIngestion } from './constructs/ingestion';
import { NovelApi } from './constructs/api';
import { NovelFrontend } from './constructs/frontend';
import { appConfig } from './config';

/**
 * 短編小説生成ワークフロー一式を組み立てるルートスタック。
 * 各コンストラクトは自身の依存先を明示的なpropsとして受け取り（CDKレベルでも依存性を
 * 注入する形にすることで）、ここでの組み立て順序がそのまま依存関係を表す。
 * 順序: Storage（DynamoDB+S3） → Workflow（Step Functions+Lambda） → Ingestion（SQS+Pipe） → Api（HTTP API+Lambda）
 *       → Frontend（S3+CloudFront。事前に`npm run build:frontend`でReactアプリをビルドしておく必要がある）
 */
export class NovelGeneratorStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const storage = new NovelStorage(this, 'Storage');

    const workflow = new NovelWorkflow(this, 'Workflow', {
      storyTable: storage.storyTable,
      contentBucket: storage.contentBucket,
      bedrockModelId: appConfig.bedrock.modelId,
      bedrockFoundationModelId: appConfig.bedrock.foundationModelId,
      bedrockFoundationModelRegions: appConfig.bedrock.foundationModelRegions,
      notificationFromAddress: appConfig.notification.fromAddress,
      finalUrlExpirySeconds: appConfig.novel.finalUrlExpirySeconds,
    });

    const ingestion = new NovelIngestion(this, 'Ingestion', {
      stateMachine: workflow.stateMachine,
    });

    const api = new NovelApi(this, 'Api', {
      storyTable: storage.storyTable,
      contentBucket: storage.contentBucket,
      storyRequestQueueUrl: ingestion.requestQueue.queueUrl,
      storyRequestQueueArn: ingestion.requestQueue.queueArn,
      finalUrlExpirySeconds: appConfig.novel.finalUrlExpirySeconds,
      stateMachine: workflow.stateMachine,
    });

    const frontend = new NovelFrontend(this, 'Frontend', {
      apiEndpoint: api.httpApi.apiEndpoint,
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      description: '物語の送信・状態確認・承認/拒否を行うHTTP APIのエンドポイント',
      value: api.httpApi.apiEndpoint,
    });
    new cdk.CfnOutput(this, 'FrontendUrl', {
      description: 'Reactフロントエンドの配信URL（CloudFront）',
      value: `https://${frontend.distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'StateMachineArn', {
      description: '短編小説生成ワークフローのStep Functions State Machine ARN',
      value: workflow.stateMachine.stateMachineArn,
    });
    new cdk.CfnOutput(this, 'StoryTableName', {
      value: storage.storyTable.tableName,
    });
    new cdk.CfnOutput(this, 'NovelContentBucketName', {
      value: storage.contentBucket.bucketName,
    });
    new cdk.CfnOutput(this, 'StoryRequestQueueUrl', {
      value: ingestion.requestQueue.queueUrl,
    });
  }
}
