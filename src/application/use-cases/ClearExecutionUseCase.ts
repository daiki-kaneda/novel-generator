import { StoryRepository } from '../ports/StoryRepository';

export interface ClearExecutionInput {
  storyId: string;
  executionArn: string;
}

export interface ClearExecutionOutput {
  storyId: string;
  cleared: boolean;
}

/**
 * ワークフロー終端時に、一致する executionArn だけを Story から外してロックを解放する。
 * 別実行の ARN が既に載っている場合は触らない。
 */
export class ClearExecutionUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(input: ClearExecutionInput): Promise<ClearExecutionOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    if (story.executionArn !== input.executionArn) {
      return { storyId: input.storyId, cleared: false };
    }

    story.clearExecution();
    await this.storyRepository.saveStory(story);
    return { storyId: input.storyId, cleared: true };
  }
}
