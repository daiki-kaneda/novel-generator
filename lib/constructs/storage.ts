import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

/**
 * Story/Plan/Chapterの状態を保持するDynamoDB単一テーブルと、
 * 章本文・最終テキストを保存するS3バケットを作成する。
 */
export class NovelStorage extends Construct {
  readonly storyTable: dynamodb.Table;
  readonly contentBucket: s3.Bucket;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.storyTable = new dynamodb.Table(this, 'StoryTable', {
      partitionKey: { name: 'storyId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'recordType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    this.contentBucket = new s3.Bucket(this, 'NovelContentBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
  }
}
