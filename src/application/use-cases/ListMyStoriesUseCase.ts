import { StoryStatus } from '../../domain/entities/Story';
import { StoryRepository } from '../ports/StoryRepository';

export interface MyStorySummary {
  storyId: string;
  status: StoryStatus;
  overview: string;
  theme: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListMyStoriesOutput {
  stories: MyStorySummary[];
}

/** 認証済みユーザー（Cognito `sub`）自身が送信した物語の一覧を、新しい順に返す。 */
export class ListMyStoriesUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(callerId: string): Promise<ListMyStoriesOutput> {
    const stories = await this.storyRepository.findByOwner(callerId);
    return {
      stories: stories.map((story) => ({
        storyId: story.storyId,
        status: story.status,
        overview: story.request.overview,
        theme: story.request.theme,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      })),
    };
  }
}
