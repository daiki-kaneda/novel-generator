import { ApprovalPurpose, ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { NotificationSender } from '../ports/NotificationSender';
import { StoryRepository } from '../ports/StoryRepository';

export interface RequestApprovalInput {
  storyId: string;
  stage: ApprovalStage;
  /** 承認決定時にワークフローを再開するためのコールバックトークン。 */
  taskToken: string;
  /** stageが`chapter`のとき必須。 */
  chapterIndex?: number;
  /** 章待ちの目的。省略時は通常の内容承認。 */
  purpose?: ApprovalPurpose;
}

function storyPageUrl(frontendBaseUrl: string, storyId: string): string {
  return `${frontendBaseUrl.replace(/\/+$/, '')}/stories/${storyId}`;
}

/**
 * 承認待ちに入る段階でコールバックトークンを永続化し、ユーザーへメールで知らせる。
 *
 * 注意: このユースケース自体はワークフローを停止しない。トークンを保存してすぐ完了するだけである。
 * 実行の一時停止は呼び出し側のオーケストレーションが行い、再開は DecideApprovalUseCase が
 * ここで保存したトークン経由の決定通知で行う。
 *
 * メール送信の失敗は握りつぶす。トークンは既に保存済みで、ユーザーはURLを知っていれば画面から承認できる。
 */
export class RequestApprovalUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly notificationSender: NotificationSender,
    private readonly frontendBaseUrl?: string,
  ) {}

  async execute(input: RequestApprovalInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.awaitApproval(input.stage, input.taskToken, input.chapterIndex, input.purpose);
    await this.storyRepository.saveStory(story);

    const baseUrl = this.frontendBaseUrl?.trim();
    if (!baseUrl) {
      return;
    }

    try {
      await this.notificationSender.sendApprovalRequestedEmail({
        toEmail: story.request.userEmail,
        storyId: story.storyId,
        storyPageUrl: storyPageUrl(baseUrl, story.storyId),
        stage: input.stage,
        chapterIndex: input.chapterIndex,
        ...(input.purpose === 'recovery' ? { purpose: 'recovery' as const } : {}),
      });
    } catch (error) {
      console.error('Failed to send approval-requested email', {
        storyId: story.storyId,
        stage: input.stage,
        error,
      });
    }
  }
}
