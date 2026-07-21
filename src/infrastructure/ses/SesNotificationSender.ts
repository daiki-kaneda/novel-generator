import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { NotificationSender } from '../../application/ports/NotificationSender';

/**
 * 物語完成時、署名付きダウンロードURLをSESでユーザーにメール送信するアダプタ。
 */
export class SesNotificationSender implements NotificationSender {
  constructor(
    private readonly client: SESClient,
    private readonly fromAddress: string,
  ) {}

  async sendCompletionEmail(toEmail: string, storyId: string, downloadUrl: string): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: '【短編小説生成】物語が完成しました', Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: [
                '物語の生成が完了しました。',
                `Story ID: ${storyId}`,
                `ダウンロードURL（期限付き）: ${downloadUrl}`,
              ].join('\n'),
              Charset: 'UTF-8',
            },
          },
        },
      }),
    );
  }
}
