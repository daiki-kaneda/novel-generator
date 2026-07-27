import { ValidationError } from '../../domain/errors/DomainErrors';
import { StoryRepository } from '../ports/StoryRepository';
import { WorkflowStarter } from '../ports/WorkflowStarter';

export interface StartRevisionInput {
  storyId: string;
  /** この章番号から最終章までを再生成する（1始まり）。 */
  rewriteFromChapterIndex: number;
  /** 修正してほしい点。 */
  feedback: string;
}

export interface StartRevisionOutput {
  storyId: string;
  executionArn: string;
  rewriteFromChapterIndex: number;
}

/**
 * 完成済み物語に対し、既存生成ワークフローを「最終拒否以降」から再実行する。
 * StartExecution 入力の rewriteFromChapterIndex / feedback により SM 入口で分岐する。
 */
export class StartRevisionUseCase {
  constructor(
    private readonly storyRepository: StoryRepository,
    private readonly workflowStarter: WorkflowStarter,
  ) {}

  async execute(input: StartRevisionInput): Promise<StartRevisionOutput> {
    const feedback = input.feedback?.trim() ?? '';
    if (!feedback) {
      throw new ValidationError('feedback is required to start a revision');
    }
    if (
      !Number.isInteger(input.rewriteFromChapterIndex) ||
      input.rewriteFromChapterIndex < 1
    ) {
      throw new ValidationError('rewriteFromChapterIndex must be a positive integer');
    }

    const story = await this.storyRepository.getStory(input.storyId);
    if (story.status !== 'COMPLETED') {
      throw new ValidationError(
        `Story ${input.storyId} must be COMPLETED to start a revision (current: ${story.status})`,
      );
    }

    const plan = await this.storyRepository.getPlan(input.storyId);
    const maxIndex = Math.max(...plan.chapters.map((c) => c.index));
    if (input.rewriteFromChapterIndex > maxIndex) {
      throw new ValidationError(
        `rewriteFromChapterIndex must be an integer between 1 and ${maxIndex}`,
      );
    }

    const { executionArn } = await this.workflowStarter.startExecution({
      storyId: input.storyId,
      feedback,
      rewriteFromChapterIndex: input.rewriteFromChapterIndex,
    });

    story.moveTo('CHAPTERS_GENERATING');
    story.bindExecution(executionArn);
    await this.storyRepository.saveStory(story);

    return {
      storyId: input.storyId,
      executionArn,
      rewriteFromChapterIndex: input.rewriteFromChapterIndex,
    };
  }
}
