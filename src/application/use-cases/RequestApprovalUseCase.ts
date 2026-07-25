import { ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { StoryRepository } from '../ports/StoryRepository';

export interface RequestApprovalInput {
  storyId: string;
  stage: ApprovalStage;
  /** Step Functionsの`waitForTaskToken`タスクから渡されるトークン。 */
  taskToken: string;
  /** stageが`chapter`のとき必須。 */
  chapterIndex?: number;
}

/**
 * Step Functionsが`waitForTaskToken`で待機状態に入る際、taskTokenを永続化する。
 * このユースケース自体はすぐに完了し、実際の「待機」はStep Functions側が行う。
 * 後続の承認/拒否API呼び出し（DecideApprovalUseCase）がここで保存したtaskTokenを使って
 * ワークフローを再開させる。
 */
export class RequestApprovalUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(input: RequestApprovalInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.awaitApproval(input.stage, input.taskToken, input.chapterIndex);
    await this.storyRepository.saveStory(story);
  }
}
