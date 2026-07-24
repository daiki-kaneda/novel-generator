import { Duration } from 'aws-cdk-lib';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import {
  Pipe,
  InputTransformation,
  LogLevel,
  CloudwatchLogsLogDestination,
  IncludeExecutionData,
} from '@aws-cdk/aws-pipes-alpha';
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

    // logLevelだけでは出力先がなくログが出ない。CloudWatch LogsへERRORを送る。
    const pipeLogGroup = new logs.LogGroup(this, 'StoryRequestPipeLogGroup', {
      retention: logs.RetentionDays.ONE_WEEK,
    });

    new Pipe(this, 'StoryRequestPipe', {
      description: 'SQSの物語生成リクエストをStep Functionsの実行開始にfire-and-forgetで橋渡しする',
      // 1リクエスト=1メッセージ=1実行を保証するため、バッチ処理はしない
      source: new SqsSource(this.requestQueue, { batchSize: 1 }),
      target: new SfnStateMachine(props.stateMachine, {
        invocationType: StateMachineInvocationType.FIRE_AND_FORGET,
        // fromObject+DynamicInputは文字列値のクォートを外し無効JSONになる。
        // fromTextで `"<$.body.storyId>"` を残し、置換後も有効なJSONにする。
        // @see https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-pipes-input-transformation.html
        inputTransformation: InputTransformation.fromText('{"storyId": "<$.body.storyId>"}'),
      }),
      logLevel: LogLevel.ERROR,
      logDestinations: [new CloudwatchLogsLogDestination(pipeLogGroup)],
      // 失敗時にpayload / awsRequest / awsResponseを残し、入力変換やStartExecution失敗を切り分けやすくする
      logIncludeExecutionData: [IncludeExecutionData.ALL],
    });
  }
}
