import { Story } from '../../domain/entities/Story';
import { StoryLength, resolveStoryLength } from '../../domain/value-objects/StoryLength';
import { StoryRepository } from '../ports/StoryRepository';
import { RequestQueue } from '../ports/RequestQueue';

export interface SubmitStoryInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  userEmail: string;
  /** 省略時は true。 */
  requirePlanApproval?: boolean;
  /** 省略時は false。 */
  requireChapterApproval?: boolean;
  /** 省略時は short。 */
  length?: StoryLength;
}

export interface SubmitStoryOutput {
  storyId: string;
}

/** ユーザーが物語の概要・テーマ・登場人物を送信し、ワークフローを開始する。 */
export class SubmitStoryUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly requestQueue: RequestQueue,
  ) {}

  async execute(input: SubmitStoryInput): Promise<SubmitStoryOutput> {
    const story = Story.submit({
      overview: input.overview,
      theme: input.theme,
      characters: input.characters,
      tone: input.tone,
      userEmail: input.userEmail,
      requirePlanApproval: input.requirePlanApproval ?? true,
      requireChapterApproval: input.requireChapterApproval ?? false,
      length: resolveStoryLength(input.length),
    });

    await this.storyRepository.createStory(story);
    await this.requestQueue.enqueueStoryRequest(story.storyId);

    return { storyId: story.storyId };
  }
}
