import { Chapter } from '../../domain/entities/Chapter';
import {
  formatContradictionForbiddenDevelopment,
  parseChapterGenerationError,
} from '../../domain/value-objects/ChapterGenerationError';
import { StoryRepository } from '../ports/StoryRepository';
import { WorldStateRepository } from '../ports/WorldStateRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';

export interface CompensateChapterFailureInput {
  storyId: string;
  chapterIndex: number;
  /** 禁止リストに追加する理由（矛盾内容など）。生の Lambda JSON は渡さない。 */
  reason?: string;
  /** Step Functions Catch が載せる Lambda エラー。 */
  error?: {
    Error?: string;
    Cause?: string;
  };
}

export interface CompensateChapterFailureOutput {
  storyId: string;
  chapterIndex: number;
}

/**
 * 章生成失敗時の補償: S3 本文削除、TKG を直前スナップショットへ戻す、章を PENDING に戻す。
 * あわせてユーザー向けの失敗内容を Story に記録する。
 */
export class CompensateChapterFailureUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly worldStateRepository: WorldStateRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
  ) {}

  async execute(input: CompensateChapterFailureInput): Promise<CompensateChapterFailureOutput> {
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapter = await this.storyRepository.findChapter(input.storyId, input.chapterIndex);
    const outline = plan.chapters.find((c) => c.index === input.chapterIndex);
    const parsedError = parseChapterGenerationError(
      input.chapterIndex,
      input.error,
      input.reason,
    );

    if (chapter?.s3Key) {
      await this.chapterContentStorage.deleteChapterText(input.storyId, chapter.s3Key);
    }

    await this.worldStateRepository.rollbackToSnapshot(input.storyId, input.chapterIndex - 1);

    const forbidden =
      parsedError.kind === 'contradiction'
        ? formatContradictionForbiddenDevelopment(
            parsedError.chapterIndex,
            parsedError.contradictions ?? [],
          )
        : parsedError.message.trim();
    if (forbidden) {
      plan.addForbiddenDevelopment(forbidden);
      await this.storyRepository.savePlan(input.storyId, plan);
    }

    if (outline) {
      await this.storyRepository.saveChapter(input.storyId, Chapter.fromOutline(outline));
    }

    const story = await this.storyRepository.getStory(input.storyId);
    story.recordChapterError(parsedError);
    await this.storyRepository.saveStory(story);

    return {
      storyId: input.storyId,
      chapterIndex: input.chapterIndex,
    };
  }
}
