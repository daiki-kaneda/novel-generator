import { Plan, PlanSnapshot } from '../../domain/entities/Plan';
import { Chapter } from '../../domain/entities/Chapter';
import { StoryRepository } from '../ports/StoryRepository';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';

export interface GeneratePlanInput {
  storyId: string;
  /** ユーザーがプランを拒否した際のフィードバック。指定時は再生成として扱う。 */
  feedback?: string;
}

export interface GeneratePlanOutput {
  storyId: string;
  /** 生成対象となる章indexの一覧（1始まり）。 */
  chapterIndexes: number[];
  /** 呼び出し側が次工程（承認待ちへ進むかスキップするか）を決めるためのフラグ。 */
  requirePlanApproval: boolean;
  requireChapterApproval: boolean;
}

/**
 * プラン（概要・テーマ・登場人物・章構成）を生成、またはフィードバックに基づき再生成する。
 * 入力の正本は承認済み（または承認スキップ済み）の StoryMetadata。
 * 生成後、章構成に合わせて章レコードを初期化し、次のステップ（承認依頼）に備える。
 */
export class GeneratePlanUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly novelTextGenerator: NovelTextGenerator,
  ) {}

  async execute(input: GeneratePlanInput): Promise<GeneratePlanOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.moveTo('PLAN_GENERATING');
    await this.storyRepository.saveStory(story);

    const metadata = await this.storyRepository.getMetadata(input.storyId);
    const previousPlan = await this.storyRepository.findPlan(input.storyId);
    const metadataProps = metadata.toProps();

    const generated = await this.novelTextGenerator.generatePlan({
      metadata: {
        overview: metadataProps.overview,
        theme: metadataProps.theme,
        tone: metadataProps.tone,
        characters: metadataProps.characters,
        world: metadataProps.world,
        timelineRules: metadataProps.timelineRules,
        consistencyNotes: metadataProps.consistencyNotes,
      },
      length: story.request.length,
      previousPlan: previousPlan?.toProps(),
      feedback: input.feedback,
      callContext: { storyId: input.storyId },
    });

    const plan = Plan.create({
      summary: generated.summary,
      theme: generated.theme || metadata.theme,
      // Plan.characters が執筆時の正本。生成欠落時は承認済み Metadata を初期値としてコピーする。
      characters:
        generated.characters?.length > 0
          ? generated.characters
          : metadata.characters.map((c) => ({ ...c })),
      chapters: generated.chapters,
    });

    for (const pastFeedback of previousPlan?.revisionHistory ?? []) {
      plan.recordRejection(pastFeedback);
    }
    if (input.feedback) {
      plan.recordRejection(input.feedback);
    }

    await this.storyRepository.savePlan(input.storyId, plan);
    await this.storyRepository.initializeChapters(
      input.storyId,
      plan.chapters.map((outline) => Chapter.fromOutline(outline)),
    );

    // Plan 再生成時は旧変遷を消し、初期スナップショットだけを残す。
    await this.storyRepository.clearPlanSnapshots(input.storyId);
    await this.storyRepository.savePlanSnapshot(
      input.storyId,
      PlanSnapshot.create({
        afterChapterIndex: 0,
        trigger: 'initial',
        plan: plan.toProps(),
      }),
    );

    return {
      storyId: input.storyId,
      chapterIndexes: plan.chapters.map((outline) => outline.index),
      requirePlanApproval: story.request.requirePlanApproval,
      requireChapterApproval: story.request.requireChapterApproval,
    };
  }
}
