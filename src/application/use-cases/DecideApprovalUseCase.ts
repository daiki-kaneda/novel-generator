import { ApprovalDecision, ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';
import { ApprovalGateway } from '../ports/ApprovalGateway';
import { UsageAccountRepository } from '../ports/UsageAccountRepository';
import { assertWithinUsageBudget } from '../services/UsageBudgetGuard';

export interface DecideApprovalInput {
  storyId: string;
  /** どの承認段階に対する決定か（呼び出し元のAPIエンドポイントが固定する）。 */
  expectedStage: ApprovalStage;
  approved: boolean;
  /** 拒否時は必須。修正してほしい点を記述する。 */
  feedback?: string;
  /** expectedStageが`chapter`のとき、対象章のindex。 */
  chapterIndex?: number;
  /**
   * 最終拒否時に部分再生成を開始する章番号。
   * 未指定時は最終章のみの再生成をデフォルトとする（フルリライト回避）。
   */
  rewriteFromChapterIndex?: number;
}

/**
 * ユーザーによるプラン承認/拒否・章承認/拒否・最終承認/拒否に対応するユースケース。
 * `expectedStage`で対象段階を検証しつつ1つのユースケースに統一している。
 */
export class DecideApprovalUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly approvalGateway: ApprovalGateway,
    private readonly usageAccountRepository: UsageAccountRepository,
  ) {}

  async execute(input: DecideApprovalInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);

    if (story.taskStage !== input.expectedStage || !story.currentTaskToken) {
      throw new ValidationError(
        `Story ${input.storyId} is not currently awaiting a "${input.expectedStage}" approval decision`,
      );
    }

    // 承認・拒否のいずれも次工程の生成（追加コスト）につながるため、決定送信前に予算を確認する。
    await assertWithinUsageBudget(this.usageAccountRepository, story.request.userEmail);

    if (input.expectedStage === 'chapter') {
      if (input.chapterIndex === undefined) {
        throw new ValidationError('chapterIndex is required for chapter approval decisions');
      }
      if (story.currentChapterIndex !== input.chapterIndex) {
        throw new ValidationError(
          `Story ${input.storyId} is awaiting approval for chapter ${story.currentChapterIndex}, not ${input.chapterIndex}`,
        );
      }
    }

    let rewriteFromChapterIndex = input.rewriteFromChapterIndex;
    if (!input.approved && input.expectedStage === 'final' && rewriteFromChapterIndex === undefined) {
      const plan = await this.storyRepository.findPlan(input.storyId);
      const lastIndex = plan?.chapters[plan.chapters.length - 1]?.index;
      rewriteFromChapterIndex = lastIndex ?? 1;
    }

    const decision = input.approved
      ? ApprovalDecision.approve()
      : ApprovalDecision.reject(input.feedback ?? '', rewriteFromChapterIndex);

    await this.approvalGateway.sendDecision(story.currentTaskToken, decision);

    story.clearApproval();
    await this.storyRepository.saveStory(story);
  }
}
