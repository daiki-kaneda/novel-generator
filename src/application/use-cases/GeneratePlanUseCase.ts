import { Plan } from '../../domain/entities/Plan';
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
}

/**
 * プラン（概要・テーマ・登場人物・章構成）を生成、またはフィードバックに基づき再生成する。
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

    const previousPlan = await this.storyRepository.findPlan(input.storyId);

    const generated = await this.novelTextGenerator.generatePlan({
      overview: story.request.overview,
      theme: story.request.theme,
      characters: story.request.characters,
      tone: story.request.tone,
      previousPlan: previousPlan?.toProps(),
      feedback: input.feedback,
    });

    const plan = Plan.create({
      summary: generated.summary,
      theme: generated.theme,
      characters: generated.characters,
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

    return { storyId: input.storyId };
  }
}
