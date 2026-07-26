import { ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { StoryRepository } from '../ports/StoryRepository';

export interface RequestApprovalInput {
  storyId: string;
  stage: ApprovalStage;
  /** 承認決定時にワークフローを再開するためのコールバックトークン。 */
  taskToken: string;
  /** stageが`chapter`のとき必須。 */
  chapterIndex?: number;
}

/**
 * 承認待ちに入る段階でコールバックトークンを永続化する。
 *
 * 注意: このユースケース自体はワークフローを停止しない。トークンを保存してすぐ完了するだけである。
 * 実行の一時停止は呼び出し側のオーケストレーションが行い、再開は DecideApprovalUseCase が
 * ここで保存したトークン経由の決定通知で行う。
 */
export class RequestApprovalUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(input: RequestApprovalInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.awaitApproval(input.stage, input.taskToken, input.chapterIndex);
    await this.storyRepository.saveStory(story);
  }
}
