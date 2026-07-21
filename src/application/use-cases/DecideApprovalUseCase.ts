import { ApprovalDecision, ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';
import { ApprovalGateway } from '../ports/ApprovalGateway';

export interface DecideApprovalInput {
  storyId: string;
  /** どの承認段階に対する決定か（呼び出し元のAPIエンドポイントが固定する）。 */
  expectedStage: ApprovalStage;
  approved: boolean;
  /** 拒否時は必須。修正してほしい点を記述する。 */
  feedback?: string;
}

/**
 * ユーザーによるプラン承認/拒否・最終承認/拒否の両方に対応するユースケース。
 * プラン用・最終用で処理内容は同一（対象のtaskTokenへ決定を送るだけ）なため、
 * `expectedStage`で対象段階を検証しつつ1つのユースケースに統一している。
 */
export class DecideApprovalUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly approvalGateway: ApprovalGateway,
  ) {}

  async execute(input: DecideApprovalInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);

    if (story.taskStage !== input.expectedStage || !story.currentTaskToken) {
      throw new ValidationError(
        `Story ${input.storyId} is not currently awaiting a "${input.expectedStage}" approval decision`,
      );
    }

    const decision = input.approved
      ? ApprovalDecision.approve()
      : ApprovalDecision.reject(input.feedback ?? '');

    await this.approvalGateway.sendDecision(story.currentTaskToken, decision);

    story.clearApproval();
    await this.storyRepository.saveStory(story);
  }
}
