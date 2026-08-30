import { Story } from '../../domain/entities/Story';
import { StoryLength, resolveStoryLength } from '../../domain/value-objects/StoryLength';
import { StoryRepository } from '../ports/StoryRepository';
import { RequestQueue } from '../ports/RequestQueue';
import { UsageAccountRepository } from '../ports/UsageAccountRepository';
import { assertWithinUsageBudget } from '../services/UsageBudgetGuard';

export interface SubmitStoryInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  /** 地理・時代などの任意ヒント。 */
  setting?: string;
  userEmail: string;
  /** 省略時は true。 */
  requireMetadataApproval?: boolean;
  /** 省略時は true。 */
  requirePlanApproval?: boolean;
  /** 省略時は false。 */
  requireChapterApproval?: boolean;
  /**
   * 省略時は !requireChapterApproval。
   * 評価バッチなど無承認完走では false を明示する。
   */
  requireFinalApproval?: boolean;
  /** 省略時は short。 */
  length?: StoryLength;
}

export interface SubmitStoryOutput {
  storyId: string;
}

/** ユーザーが物語の概要・テーマ・登場人物を送信し、ワークフローを開始する。 */
export class SubmitStoryUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly requestQueue: RequestQueue,
    private readonly usageAccountRepository: UsageAccountRepository,
  ) {}

  async execute(input: SubmitStoryInput): Promise<SubmitStoryOutput> {
    const requireChapterApproval = input.requireChapterApproval ?? false;
    const story = Story.submit({
      overview: input.overview,
      theme: input.theme,
      characters: input.characters,
      tone: input.tone,
      setting: input.setting,
      userEmail: input.userEmail,
      requireMetadataApproval: input.requireMetadataApproval ?? true,
      requirePlanApproval: input.requirePlanApproval ?? true,
      requireChapterApproval,
      requireFinalApproval: input.requireFinalApproval ?? !requireChapterApproval,
      length: resolveStoryLength(input.length),
    });

    // Story.submit のバリデーション（メールアドレス形式など）を通過した後に予算を確認する。
    await assertWithinUsageBudget(this.usageAccountRepository, story.request.userEmail);

    await this.storyRepository.createStory(story);
    await this.requestQueue.enqueueStoryRequest(story.storyId);

    return { storyId: story.storyId };
  }
}
