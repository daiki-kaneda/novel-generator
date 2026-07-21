import { RevisionScopePolicy } from '../../domain/services/RevisionScopePolicy';
import { StoryRepository } from '../ports/StoryRepository';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';

export interface CreateRevisionPlanInput {
  storyId: string;
  /** 最終承認拒否時のフィードバック。 */
  feedback: string;
}

export interface CreateRevisionPlanOutput {
  /** 改訂対象となった章のindex一覧（Step FunctionsのMapのitemsPathに渡す）。 */
  chapterIndexes: number[];
}

/**
 * 最終承認が拒否された際、フィードバックからどの章のどの部分を更新すべきかの
 * プランを作成し、対象章を「改訂待ち」としてマークする。
 */
export class CreateRevisionPlanUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly novelTextGenerator: NovelTextGenerator,
  ) {}

  async execute(input: CreateRevisionPlanInput): Promise<CreateRevisionPlanOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.moveTo('REVISING');
    await this.storyRepository.saveStory(story);

    const chapters = await this.storyRepository.getChapters(input.storyId);

    const proposed = await this.novelTextGenerator.proposeRevisionPlan({
      feedback: input.feedback,
      chapters: chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        outline: chapter.outline,
        summaryKeyPoints: chapter.summaryKeyPoints,
      })),
    });

    const resolved = RevisionScopePolicy.resolve(
      proposed,
      chapters.map((chapter) => chapter.index),
    );

    // LLMがどの章にも紐付けられなかった場合は、最終章への修正として扱うフォールバック。
    const effective =
      resolved.length > 0
        ? resolved
        : chapters.length > 0
          ? [{ chapterIndex: chapters[chapters.length - 1].index, instruction: input.feedback }]
          : [];

    for (const item of effective) {
      const chapter = chapters.find((c) => c.index === item.chapterIndex);
      if (!chapter) {
        continue;
      }
      chapter.requestRevision(item.instruction);
      await this.storyRepository.saveChapter(input.storyId, chapter);
    }

    return { chapterIndexes: effective.map((item) => item.chapterIndex) };
  }
}
