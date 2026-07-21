import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { RequestQueue } from '../../application/ports/RequestQueue';

/**
 * 物語生成リクエストをSQSに投入するアダプタ。
 * このキューはEventBridge PipeによってポーリングされStep Functionsの実行を開始するため、
 * ここでは`storyId`を通知するだけでよい（詳細はDynamoDBを見に行く）。
 */
export class SqsRequestQueue implements RequestQueue {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async enqueueStoryRequest(storyId: string): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify({ storyId }),
      }),
    );
  }
}
