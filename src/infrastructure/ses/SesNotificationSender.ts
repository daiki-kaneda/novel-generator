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

function approvalSubject(
  stage: ApprovalStage,
  chapterIndex?: number,
  purpose?: ApprovalRequestedEmailInput['purpose'],
): string {
  if (stage === 'chapter' && purpose === 'recovery' && chapterIndex !== undefined) {
    return `【短編小説生成】第${chapterIndex}章の生成に失敗しました`;
  }
  if (stage === 'chapter' && chapterIndex !== undefined) {
    return `【短編小説生成】第${chapterIndex}章の承認が必要です`;
  }
  return STAGE_SUBJECT[stage];
}

function approvalBody(input: ApprovalRequestedEmailInput): string {
  const isRecovery = input.stage === 'chapter' && input.purpose === 'recovery';
  const intro = isRecovery
    ? '章の本文生成が2回失敗したため、修正の指示が必要です。'
    : '物語の生成が承認待ちになりました。';
  const stageLine = isRecovery
    ? `第${input.chapterIndex}章は未生成のままです。承認では先に進めないので、画面から修正の指示を出して再生成してください。`
    : input.stage === 'chapter' && input.chapterIndex !== undefined
      ? `第${input.chapterIndex}章の本文を確認し、承認または拒否してください。`
      : '内容を確認し、承認または拒否してください。';
  return [
    intro,
    stageLine,
    `Story ID: ${input.storyId}`,
    `確認: ${input.storyPageUrl}`,
    '',
    'このURLを開くには、物語の所有者としてログインしている必要があります。',
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
          Subject: { Data: approvalSubject(input.stage, input.chapterIndex, input.purpose), Charset: 'UTF-8' },
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
