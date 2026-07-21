/**
 * ユーザーへの完了通知（SES）を抽象化するポート。
 */
export interface NotificationSender {
  sendCompletionEmail(toEmail: string, storyId: string, downloadUrl: string): Promise<void>;
}
