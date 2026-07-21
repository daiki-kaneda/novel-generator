import { Duration } from 'aws-cdk-lib';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import { Pipe, InputTransformation, LogLevel } from '@aws-cdk/aws-pipes-alpha';
import { SqsSource } from '@aws-cdk/aws-pipes-sources-alpha';
import { SfnStateMachine, StateMachineInvocationType } from '@aws-cdk/aws-pipes-targets-alpha';
import { Construct } from 'constructs';

export interface NovelIngestionProps {
  stateMachine: sfn.IStateMachine;
}

/**
 * 物語生成リクエストの受付キューと、それをStep Functionsの実行開始へ橋渡しする
 * EventBridge Pipeを定義する。SQSでAPI層とワークフロー起動を疎結合にし、
 * Pipeが直接`StartExecution`を呼び出すためポーリング用のLambdaを必要としない。
 */
export class NovelIngestion extends Construct {
  readonly requestQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: NovelIngestionProps) {
    super(scope, id);

    const deadLetterQueue = new sqs.Queue(this, 'StoryRequestDLQ', {
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
    });

    this.requestQueue = new sqs.Queue(this, 'StoryRequestQueue', {
      visibilityTimeout: Duration.seconds(30),
      enforceSSL: true,
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 3,
      },
    });

    new Pipe(this, 'StoryRequestPipe', {
      description: 'SQSの物語生成リクエストをStep Functionsの実行開始にfire-and-forgetで橋渡しする',
      // 1リクエスト=1メッセージ=1実行を保証するため、バッチ処理はしない
      source: new SqsSource(this.requestQueue, { batchSize: 1 }),
      target: new SfnStateMachine(props.stateMachine, {
        invocationType: StateMachineInvocationType.FIRE_AND_FORGET,
        // SQSメッセージのbody（`{"storyId": "..."}`というJSON文字列）をそのまま
        // StartExecutionのinputとして渡す。
        inputTransformation: InputTransformation.fromEventPath('$.body'),
      }),
      logLevel: LogLevel.ERROR,
    });
  }
}
