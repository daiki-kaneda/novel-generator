import { Story } from '../../domain/entities/Story';
import { StoryRepository } from '../ports/StoryRepository';
import { RequestQueue } from '../ports/RequestQueue';

export interface SubmitStoryInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  userEmail: string;
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
    });

    await this.storyRepository.createStory(story);
    await this.requestQueue.enqueueStoryRequest(story.storyId);

    return { storyId: story.storyId };
  }
}
