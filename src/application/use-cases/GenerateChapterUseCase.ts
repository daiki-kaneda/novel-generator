import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';

export interface GenerateChapterInput {
  storyId: string;
  chapterIndex: number;
  /**
   * 章承認拒否時のフィードバック。空文字・未指定の場合は通常の生成、
   * 指定時は改訂として扱う。
   */
  revisionFeedback?: string;
}

/**
 * 指定された1章の本文を生成する。初回生成・改訂のどちらでも使用する
 * （`revisionFeedback`または章に既にある`revisionInstruction`があれば改訂として扱われる）。
 *
 * 一貫性のため設定書（Metadata）全体と Plan 全体（全章アウトライン）を渡し、
 * 前章の本文全体は渡さず「重要ポイントの要約」のみをコンテキストとして使う。
 */
export class GenerateChapterUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly novelTextGenerator: NovelTextGenerator,
  ) {}

  async execute(input: GenerateChapterInput): Promise<void> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.moveTo('CHAPTERS_GENERATING');
    await this.storyRepository.saveStory(story);

    const metadata = await this.storyRepository.getMetadata(input.storyId);
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapter = await this.storyRepository.getChapter(input.storyId, input.chapterIndex);

    const feedback = input.revisionFeedback?.trim();
    if (feedback) {
      chapter.requestRevision(feedback);
    }

    const previousChapter =
      input.chapterIndex > 1
        ? await this.storyRepository.findChapter(input.storyId, input.chapterIndex - 1)
        : null;

    const metadataProps = metadata.toProps();
    const chapterText = await this.novelTextGenerator.generateChapterText({
      metadata: {
        overview: metadataProps.overview,
        theme: metadataProps.theme,
        tone: metadataProps.tone,
        characters: metadataProps.characters,
        world: metadataProps.world,
        timelineRules: metadataProps.timelineRules,
        consistencyNotes: metadataProps.consistencyNotes,
      },
      plan: {
        summary: plan.summary,
        chapters: plan.chapters.map((outline) => ({ ...outline })),
      },
      chapterOutline: { index: chapter.index, title: chapter.title, outline: chapter.outline },
      length: story.request.length,
      previousChapterSummary: previousChapter?.summaryKeyPoints,
      revisionInstruction: chapter.revisionInstruction,
    });

    const s3Key = await this.chapterContentStorage.saveChapterText(
      input.storyId,
      input.chapterIndex,
      chapterText,
    );
    const summary = await this.novelTextGenerator.summarizeChapter(
      chapterText,
      story.request.length,
    );

    chapter.complete(s3Key, summary);
    await this.storyRepository.saveChapter(input.storyId, chapter);
  }
}
