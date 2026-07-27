import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

const HANDLERS_DIR = path.join(__dirname, '..', '..', 'src', 'interface', 'handlers');

export interface CreateHandlerFunctionProps {
  /** `src/interface/handlers/`配下のエントリファイル名（例: `submitStory.ts`）。 */
  entry: string;
  environment?: Record<string, string>;
  timeout?: Duration;
  memorySize?: number;
  description?: string;
}

/**
 * ランタイム同梱の SDK で足りるクライアントは外部化し、デプロイサイズを抑える。
 * Bedrock は structured output（OutputFormatType など）が必要なため同梱する。
 * ランタイム同梱版には未実装の API があり、external だと実行時に undefined になる。
 */
const EXTERNAL_AWS_SDK_MODULES = [
  '@aws-sdk/client-dynamodb',
  '@aws-sdk/lib-dynamodb',
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner',
  '@aws-sdk/client-sfn',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sqs',
];

/**
 * `src/interface/handlers/*.ts`をエントリポイントとするLambda関数を作成する共通ヘルパー。
 */
export function createHandlerFunction(
  scope: Construct,
  id: string,
  props: CreateHandlerFunctionProps,
): NodejsFunction {
  return new NodejsFunction(scope, id, {
    entry: path.join(HANDLERS_DIR, props.entry),
    handler: 'handler',
    runtime: Runtime.NODEJS_20_X,
    architecture: Architecture.ARM_64,
    timeout: props.timeout ?? Duration.seconds(30),
    memorySize: props.memorySize ?? 512,
    environment: props.environment,
    description: props.description,
    bundling: {
      externalModules: EXTERNAL_AWS_SDK_MODULES,
      minify: true,
    },
  });
}
