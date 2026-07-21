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
 * `src/interface/handlers/*.ts`をエントリポイントとするLambda関数を作成する共通ヘルパー。
 * AWS Lambdaのnodejs20.xランタイムにはAWS SDK for JavaScript v3が組み込まれているため、
 * バンドルから除外してコールドスタートとデプロイサイズを削減する。
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
      externalModules: ['@aws-sdk/*'],
      minify: true,
    },
  });
}
