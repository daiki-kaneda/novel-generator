import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { SFNClient } from '@aws-sdk/client-sfn';
import { SESClient } from '@aws-sdk/client-ses';
import { SQSClient } from '@aws-sdk/client-sqs';

import { DynamoDbStoryRepository } from '../../infrastructure/dynamodb/DynamoDbStoryRepository';
import { S3ChapterContentStorage } from '../../infrastructure/s3/S3ChapterContentStorage';
import { BedrockNovelTextGenerator } from '../../infrastructure/bedrock/BedrockNovelTextGenerator';
import { StepFunctionsApprovalGateway } from '../../infrastructure/stepfunctions/StepFunctionsApprovalGateway';
import { SesNotificationSender } from '../../infrastructure/ses/SesNotificationSender';
import { SqsRequestQueue } from '../../infrastructure/sqs/SqsRequestQueue';

import { SubmitStoryUseCase } from '../../application/use-cases/SubmitStoryUseCase';
import { GetStoryStatusUseCase } from '../../application/use-cases/GetStoryStatusUseCase';
import { GetChapterContentUseCase } from '../../application/use-cases/GetChapterContentUseCase';
import { GenerateMetadataUseCase } from '../../application/use-cases/GenerateMetadataUseCase';
import { GeneratePlanUseCase } from '../../application/use-cases/GeneratePlanUseCase';
import { RequestApprovalUseCase } from '../../application/use-cases/RequestApprovalUseCase';
import { DecideApprovalUseCase } from '../../application/use-cases/DecideApprovalUseCase';
import { GenerateChapterUseCase } from '../../application/use-cases/GenerateChapterUseCase';
import { FinalizeNovelUseCase } from '../../application/use-cases/FinalizeNovelUseCase';

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * 遅延シングルトン化のヘルパー。実際に呼び出されるまでインスタンス化しないため、
 * 各Lambdaは自分が使うユースケースの依存先（AWSクライアント・環境変数）だけを
 * 初期化すればよく、無関係なサービスの環境変数を要求しない。
 * 一度生成した後はウォームスタート間で再利用される。
 */
function lazy<T>(factory: () => T): () => T {
  let instance: T | undefined;
  return () => {
    if (instance === undefined) {
      instance = factory();
    }
    return instance;
  };
}

const dynamoDbDocumentClient = lazy(() => DynamoDBDocumentClient.from(new DynamoDBClient({})));
const s3Client = lazy(() => new S3Client({}));
const bedrockClient = lazy(() => new BedrockRuntimeClient({}));
const sfnClient = lazy(() => new SFNClient({}));
const sesClient = lazy(() => new SESClient({}));
const sqsClient = lazy(() => new SQSClient({}));

const storyRepository = lazy(
  () => new DynamoDbStoryRepository(dynamoDbDocumentClient(), requiredEnv('STORY_TABLE_NAME')),
);
const chapterContentStorage = lazy(
  () => new S3ChapterContentStorage(s3Client(), requiredEnv('CONTENT_BUCKET_NAME')),
);
const novelTextGenerator = lazy(
  () => new BedrockNovelTextGenerator(bedrockClient(), requiredEnv('BEDROCK_MODEL_ID')),
);
const approvalGateway = lazy(() => new StepFunctionsApprovalGateway(sfnClient()));
const notificationSender = lazy(
  () => new SesNotificationSender(sesClient(), requiredEnv('NOTIFICATION_FROM_ADDRESS')),
);
const requestQueue = lazy(
  () => new SqsRequestQueue(sqsClient(), requiredEnv('STORY_REQUEST_QUEUE_URL')),
);

const finalUrlExpirySeconds = lazy(() =>
  Number(process.env.FINAL_URL_EXPIRY_SECONDS ?? 60 * 60 * 24 * 7),
);

/**
 * コンポジションルート。各Lambdaハンドラはここからユースケースを取得するだけで、
 * 具体的なインフラ実装（DynamoDB/S3/Bedrock/Step Functions/SES/SQS）を意識しない。
 * 各エントリは遅延評価されるため、実際に呼び出したユースケースの依存先だけが構築される。
 */
export const container = {
  submitStoryUseCase: lazy(() => new SubmitStoryUseCase(storyRepository(), requestQueue())),
  getStoryStatusUseCase: lazy(() => new GetStoryStatusUseCase(storyRepository())),
  getChapterContentUseCase: lazy(
    () =>
      new GetChapterContentUseCase(
        storyRepository(),
        chapterContentStorage(),
        finalUrlExpirySeconds(),
      ),
  ),
  generateMetadataUseCase: lazy(
    () => new GenerateMetadataUseCase(storyRepository(), novelTextGenerator()),
  ),
  generatePlanUseCase: lazy(
    () => new GeneratePlanUseCase(storyRepository(), novelTextGenerator()),
  ),
  requestApprovalUseCase: lazy(() => new RequestApprovalUseCase(storyRepository())),
  decideApprovalUseCase: lazy(
    () => new DecideApprovalUseCase(storyRepository(), approvalGateway()),
  ),
  generateChapterUseCase: lazy(
    () =>
      new GenerateChapterUseCase(
        storyRepository(),
        chapterContentStorage(),
        novelTextGenerator(),
      ),
  ),
  finalizeNovelUseCase: lazy(
    () =>
      new FinalizeNovelUseCase(
        storyRepository(),
        chapterContentStorage(),
        notificationSender(),
        finalUrlExpirySeconds(),
      ),
  ),
};
