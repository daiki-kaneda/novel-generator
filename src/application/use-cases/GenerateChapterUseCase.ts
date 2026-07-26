import { StoryRepository } from '../ports/StoryRepository';
import { ChapterContentStorage } from '../ports/ChapterContentStorage';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';
import { Plan } from '../../domain/entities/Plan';
import { StoryMetadataProps } from '../../domain/entities/StoryMetadata';
import { StoryLength } from '../../domain/value-objects/StoryLength';

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
 * 設定書（Metadata）の世界観・時間軸・一貫性制約は固定アンカーとして渡し、
 * 登場人物は Plan.characters を正本とする。Plan の章立ては当該章までのみ
 * （未来章はマスク）。章完成後は要約に基づき未来章と登場人物を自動改訂する。
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

    const planOutline = plan.chapters.find((outline) => outline.index === input.chapterIndex);
    if (!planOutline) {
      throw new Error(
        `Plan does not contain chapter index ${input.chapterIndex} for story ${input.storyId}`,
      );
    }
    chapter.alignOutline(planOutline.title, planOutline.outline);

    const previousChapter =
      input.chapterIndex > 1
        ? await this.storyRepository.findChapter(input.storyId, input.chapterIndex - 1)
        : null;

    const metadataProps = metadata.toProps();
    // 未来章をマスクし、当該章までのプランのみを生成コンテキストに渡す（DOME）。
    const visibleChapters = plan.chapters
      .filter((outline) => outline.index <= input.chapterIndex)
      .map((outline) => ({ ...outline }));

    const chapterText = await this.novelTextGenerator.generateChapterText({
      metadata: {
        overview: metadataProps.overview,
        theme: metadataProps.theme,
        tone: metadataProps.tone,
        world: metadataProps.world,
        timelineRules: metadataProps.timelineRules,
        consistencyNotes: metadataProps.consistencyNotes,
      },
      plan: {
        summary: plan.summary,
        characters: plan.characters.map((c) => ({ ...c })),
        chapters: visibleChapters,
      },
      chapterOutline: {
        index: planOutline.index,
        title: planOutline.title,
        outline: planOutline.outline,
      },
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

    await this.reviseFuturePlanIfNeeded({
      storyId: input.storyId,
      plan,
      metadataProps,
      completedChapterIndex: input.chapterIndex,
      completedTitle: planOutline.title,
      completedOutline: planOutline.outline,
      completedSummary: summary,
      length: story.request.length,
    });
  }

  /**
   * 最終章でなければ、完了章の要約を踏まえて未来章と登場人物を微調整する。
   * 改訂失敗時は既存 Plan を維持し、章生成自体は成功として扱う。
   */
  private async reviseFuturePlanIfNeeded(args: {
    storyId: string;
    plan: Plan;
    metadataProps: StoryMetadataProps;
    completedChapterIndex: number;
    completedTitle: string;
    completedOutline: string;
    completedSummary: string;
    length: StoryLength;
  }): Promise<void> {
    const futureChapters = args.plan.chapters
      .filter((outline) => outline.index > args.completedChapterIndex)
      .map((outline) => ({ ...outline }));
    if (futureChapters.length === 0) {
      return;
    }

    try {
      const revised = await this.novelTextGenerator.revisePlan({
        metadata: {
          overview: args.metadataProps.overview,
          theme: args.metadataProps.theme,
          tone: args.metadataProps.tone,
          world: args.metadataProps.world,
          timelineRules: args.metadataProps.timelineRules,
          consistencyNotes: args.metadataProps.consistencyNotes,
        },
        planSummary: args.plan.summary,
        planTheme: args.plan.theme,
        characters: args.plan.characters.map((c) => ({ ...c })),
        completedChapter: {
          index: args.completedChapterIndex,
          title: args.completedTitle,
          outline: args.completedOutline,
          summaryKeyPoints: args.completedSummary,
        },
        futureChapters,
        length: args.length,
      });
      args.plan.reviseFutureChapters(args.completedChapterIndex, revised.chapters);
      args.plan.replaceCharacters(revised.characters);
      await this.storyRepository.savePlan(args.storyId, args.plan);
    } catch (error) {
      // Plan 改訂の失敗で章生成を失敗させない（既存 Plan を維持して次章へ進む）。
      // アプリケーション層は DOM lib を持たないため、globalThis 経由でログする。
      const warn = (globalThis as { console?: { warn?: (...args: unknown[]) => void } }).console
        ?.warn;
      warn?.(
        `Failed to revise plan after chapter ${args.completedChapterIndex} for story ${args.storyId}:`,
        error,
      );
    }
  }
}
