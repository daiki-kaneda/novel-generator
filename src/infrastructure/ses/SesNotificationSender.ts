import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  ApprovalRequestedEmailInput,
  NotificationSender,
} from '../../application/ports/NotificationSender';
import { ApprovalStage } from '../../domain/value-objects/ApprovalDecision';

const STAGE_SUBJECT: Record<ApprovalStage, string> = {
  metadata: '【短編小説生成】設定書の承認が必要です',
  plan: '【短編小説生成】プランの承認が必要です',
  chapter: '【短編小説生成】章の承認が必要です',
  final: '【短編小説生成】最終原稿の承認が必要です',
};

function approvalSubject(stage: ApprovalStage, chapterIndex?: number): string {
  if (stage === 'chapter' && chapterIndex !== undefined) {
    return `【短編小説生成】第${chapterIndex}章の承認が必要です`;
  }
  return STAGE_SUBJECT[stage];
}

function approvalBody(input: ApprovalRequestedEmailInput): string {
  const stageLine =
    input.stage === 'chapter' && input.chapterIndex !== undefined
      ? `第${input.chapterIndex}章の本文を確認し、承認または拒否してください。`
      : '内容を確認し、承認または拒否してください。';
  return [
    '物語の生成が承認待ちになりました。',
    stageLine,
    `Story ID: ${input.storyId}`,
    `確認・承認: ${input.storyPageUrl}`,
    '',
    'このURLを知っている人は誰でも閲覧・承認できます。共有範囲に注意してください。',
  ].join('\n');
}

/**
 * SESで完成通知・承認待ち通知を送るアダプタ。
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

  async sendApprovalRequestedEmail(input: ApprovalRequestedEmailInput): Promise<void> {
    await this.client.send(
      new SendEmailCommand({
        Source: this.fromAddress,
        Destination: { ToAddresses: [input.toEmail] },
        Message: {
          Subject: { Data: approvalSubject(input.stage, input.chapterIndex), Charset: 'UTF-8' },
          Body: {
            Text: {
              Data: approvalBody(input),
              Charset: 'UTF-8',
            },
          },
        },
      }),
    );
  }
}
