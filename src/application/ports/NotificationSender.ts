import { ApprovalPurpose, ApprovalStage } from '../../domain/value-objects/ApprovalDecision';

export interface ApprovalRequestedEmailInput {
  toEmail: string;
  storyId: string;
  /** フロントのステータスページ（承認フォームがある URL）。 */
  storyPageUrl: string;
  stage: ApprovalStage;
  chapterIndex?: number;
  purpose?: ApprovalPurpose;
}

/**
 * ユーザーへの通知（SES）を抽象化するポート。
 */
export interface NotificationSender {
  sendCompletionEmail(toEmail: string, storyId: string, downloadUrl: string): Promise<void>;
  sendApprovalRequestedEmail(input: ApprovalRequestedEmailInput): Promise<void>;
}
