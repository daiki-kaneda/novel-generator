import { ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';

export interface BindExecutionInput {
  storyId: string;
  executionArn: string;
}

export interface BindExecutionOutput {
  storyId: string;
  executionArn: string;
}

/**
 * ワークフロー実行開始時に Story へ executionArn を記録し、実行中ロックとする。
 * 既に別実行の ARN がある場合は二重起動として失敗させる。
 */
export class BindExecutionUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(input: BindExecutionInput): Promise<BindExecutionOutput> {
    const executionArn = input.executionArn?.trim();
    if (!executionArn) {
      throw new ValidationError('executionArn is required');
    }

    const story = await this.storyRepository.getStory(input.storyId);
    const existing = story.executionArn;
    if (existing && existing !== executionArn) {
      throw new ValidationError(
        `Story ${input.storyId} already has a running workflow (${existing})`,
      );
    }

    if (existing !== executionArn) {
      story.bindExecution(executionArn);
      await this.storyRepository.saveStory(story);
    }

    return { storyId: input.storyId, executionArn };
  }
}
