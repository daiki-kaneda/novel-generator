import { Chapter } from '../../domain/entities/Chapter';
import { StoryRepository } from '../ports/StoryRepository';
import { WorldStateRepository } from '../ports/WorldStateRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { ValidationError } from '../../domain/errors/DomainErrors';

export interface PreparePartialRewriteInput {
  storyId: string;
  /** この章番号から最終章までを再生成する（1始まり）。 */
  rewriteFromChapterIndex: number;
  feedback?: string;
}

export interface PreparePartialRewriteOutput {
  storyId: string;
  chapterIndexes: number[];
  requireChapterApproval: boolean;
  requireFinalApproval: boolean;
  revisionFeedback: string;
}

/**
 * 最終拒否などで、指定章以降のみを再生成できるよう状態を巻き戻す。
 * 指定章より前の本文・TKG・Plan 詳細は維持する。
 */
export class PreparePartialRewriteUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly worldStateRepository: WorldStateRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
  ) {}

  async execute(input: PreparePartialRewriteInput): Promise<PreparePartialRewriteOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapters = await this.storyRepository.getChapters(input.storyId);

    const maxIndex = Math.max(...plan.chapters.map((c) => c.index));
    if (
      input.rewriteFromChapterIndex < 1 ||
      input.rewriteFromChapterIndex > maxIndex ||
      !Number.isInteger(input.rewriteFromChapterIndex)
    ) {
      throw new ValidationError(
        `rewriteFromChapterIndex must be an integer between 1 and ${maxIndex}`,
      );
    }

    story.moveTo('CHAPTERS_GENERATING');
    await this.storyRepository.saveStory(story);

    const keepThrough = input.rewriteFromChapterIndex - 1;
    await this.worldStateRepository.rollbackToSnapshot(input.storyId, keepThrough);

    if (input.feedback?.trim()) {
      plan.addForbiddenDevelopment(input.feedback.trim());
      await this.storyRepository.savePlan(input.storyId, plan);
    }

    const rewriteIndexes = plan.chapters
      .filter((c) => c.index >= input.rewriteFromChapterIndex)
      .map((c) => c.index)
      .sort((a, b) => a - b);

    for (const index of rewriteIndexes) {
      const existing = chapters.find((c) => c.index === index);
      const outline = plan.chapters.find((c) => c.index === index)!;
      if (existing?.s3Key) {
        await this.chapterContentStorage.deleteChapterText(input.storyId, existing.s3Key);
      }
      const reset = Chapter.fromOutline(outline);
      if (input.feedback?.trim()) {
        reset.requestRevision(input.feedback.trim());
      }
      await this.storyRepository.saveChapter(input.storyId, reset);
    }

    return {
      storyId: input.storyId,
      chapterIndexes: rewriteIndexes,
      requireChapterApproval: story.request.requireChapterApproval,
      requireFinalApproval: story.request.requireFinalApproval,
      revisionFeedback: input.feedback?.trim() ?? '',
    };
  }
}
