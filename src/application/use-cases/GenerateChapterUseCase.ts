import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';

export interface GenerateChapterInput {
  storyId: string;
  chapterIndex: number;
}

/**
 * 指定された1章の本文を生成する。初回生成・改訂のどちらでも使用する
 * （章に`revisionInstruction`が設定されていれば改訂として扱われる）。
 *
 * 前章の本文全体は渡さず、前章生成時に作成した「重要ポイントの要約」のみを
 * コンテキストとして暗黙的に引き渡すことで、Step FunctionsのMapステート
 * （イテレーション間でデータを直接連携できない）の制約を回避している。
 */
export class GenerateChapterUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly chapterContentStorage: ChapterContentStorage,
    private readonly novelTextGenerator: NovelTextGenerator,
  ) {}

  async execute(input: GenerateChapterInput): Promise<void> {
    const plan = await this.storyRepository.getPlan(input.storyId);
    const chapter = await this.storyRepository.getChapter(input.storyId, input.chapterIndex);

    const previousChapter =
      input.chapterIndex > 1
        ? await this.storyRepository.findChapter(input.storyId, input.chapterIndex - 1)
        : null;

    const chapterText = await this.novelTextGenerator.generateChapterText({
      planSummary: plan.summary,
      theme: plan.theme,
      characters: plan.characters,
      chapterOutline: { index: chapter.index, title: chapter.title, outline: chapter.outline },
      previousChapterSummary: previousChapter?.summaryKeyPoints,
      revisionInstruction: chapter.revisionInstruction,
    });

    const s3Key = await this.chapterContentStorage.saveChapterText(
      input.storyId,
      input.chapterIndex,
      chapterText,
    );
    const summary = await this.novelTextGenerator.summarizeChapter(chapterText);

    chapter.complete(s3Key, summary);
    await this.storyRepository.saveChapter(input.storyId, chapter);
  }
}
