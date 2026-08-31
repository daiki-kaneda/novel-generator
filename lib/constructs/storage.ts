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
  readonly usageTable: dynamodb.Table;
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

    // 「自分の物語一覧」用。META レコードのみが ownerId/createdAt を持つため、
    // METADATA/PLAN/CHAPTER 等の他レコード種別は自然にこのGSIから除外される（スパースインデックス）。
    this.storyTable.addGlobalSecondaryIndex({
      indexName: 'OwnerIndex',
      partitionKey: { name: 'ownerId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
    });

    // メールアドレス（認証必須にしないためのアカウントキー）単位のプラン割当と月次コスト集計。
    // PK=accountEmail / SK=recordType（"PROFILE" | "MONTHLY#<yyyy-MM>"）。
    this.usageTable = new dynamodb.Table(this, 'UsageTable', {
      partitionKey: { name: 'accountEmail', type: dynamodb.AttributeType.STRING },
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
