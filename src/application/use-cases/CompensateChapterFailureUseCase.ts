import { Chapter } from '../../domain/entities/Chapter';
import { StoryRepository } from '../ports/StoryRepository';
import { WorldStateRepository } from '../ports/WorldStateRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';

export interface CompensateChapterFailureInput {
  storyId: string;
  chapterIndex: number;
  /** 禁止リストに追加する理由（矛盾内容など）。 */
  reason?: string;
}

export interface CompensateChapterFailureOutput {
  storyId: string;
  chapterIndex: number;
}

/**
 * 章生成失敗時の補償: S3 本文削除、TKG を直前スナップショットへ戻す、章を PENDING に戻す。
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

    if (chapter?.s3Key) {
      await this.chapterContentStorage.deleteChapterText(input.storyId, chapter.s3Key);
    }

    await this.worldStateRepository.rollbackToSnapshot(input.storyId, input.chapterIndex - 1);

    if (input.reason?.trim()) {
      plan.addForbiddenDevelopment(input.reason.trim());
      await this.storyRepository.savePlan(input.storyId, plan);
    }

    if (outline) {
      await this.storyRepository.saveChapter(input.storyId, Chapter.fromOutline(outline));
    }

    return {
      storyId: input.storyId,
      chapterIndex: input.chapterIndex,
    };
  }
}
