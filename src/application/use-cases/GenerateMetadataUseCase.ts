import { StoryMetadata } from '../../domain/entities/StoryMetadata';
import { StoryRepository } from '../ports/StoryRepository';
import { NovelTextGenerator } from '../ports/NovelTextGenerator';

export interface GenerateMetadataInput {
  storyId: string;
  /** ユーザーがメタデータを拒否した際のフィードバック。指定時は再生成として扱う。 */
  feedback?: string;
}

export interface GenerateMetadataOutput {
  storyId: string;
  /** 呼び出し側が次工程（承認待ちへ進むかスキップするか）を決めるためのフラグ。 */
  requireMetadataApproval: boolean;
  requirePlanApproval: boolean;
  requireChapterApproval: boolean;
  requireFinalApproval: boolean;
}

/**
 * 物語設定書（メタデータ）を生成、またはフィードバックに基づき再生成する。
 * ユーザー初期リクエスト（StoryRequest）はシードとして読み、正本は METADATA に保存する。
 */
export class GenerateMetadataUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly novelTextGenerator: NovelTextGenerator,
  ) {}

  async execute(input: GenerateMetadataInput): Promise<GenerateMetadataOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    story.moveTo('METADATA_GENERATING');
    await this.storyRepository.saveStory(story);

    const previousMetadata = await this.storyRepository.findMetadata(input.storyId);

    const generated = await this.novelTextGenerator.generateMetadata({
      overview: story.request.overview,
      theme: story.request.theme,
      characters: story.request.characters,
      tone: story.request.tone,
      setting: story.request.setting,
      length: story.request.length,
      previousMetadata: previousMetadata?.toProps(),
      feedback: input.feedback,
      callContext: { storyId: input.storyId },
    });

    const metadata = StoryMetadata.create({
      overview: generated.overview,
      theme: generated.theme,
      tone: generated.tone,
      characters: generated.characters,
      world: generated.world,
      timelineRules: generated.timelineRules,
      consistencyNotes: generated.consistencyNotes,
    });

    for (const pastFeedback of previousMetadata?.revisionHistory ?? []) {
      metadata.recordRejection(pastFeedback);
    }
    if (input.feedback) {
      metadata.recordRejection(input.feedback);
    }

    await this.storyRepository.saveMetadata(input.storyId, metadata);

    return {
      storyId: input.storyId,
      requireMetadataApproval: story.request.requireMetadataApproval,
      requirePlanApproval: story.request.requirePlanApproval,
      requireChapterApproval: story.request.requireChapterApproval,
      requireFinalApproval: story.request.requireFinalApproval,
    };
  }
}
