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
 * 部分再生成ワークフローを開始する（完成後の改訂、および実行失敗後の復旧）。
 * Story.executionArn がある間は実行中ロックとして拒否する。
 * 終端なのに ARN が残っている場合は stale としてクリアしてから開始する。
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

    if (story.executionArn) {
      let status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT' | 'ABORTED';
      try {
        status = await this.workflowStarter.getExecutionStatus(story.executionArn);
      } catch {
        // 実行が既に消えている等は stale ロックとして扱う
        status = 'FAILED';
      }
      if (status === 'RUNNING') {
        throw new ValidationError(
          `Story ${input.storyId} already has a running workflow (${story.executionArn})`,
        );
      }
      story.clearExecution();
      await this.storyRepository.saveStory(story);
    }

    const plan = await this.storyRepository.findPlan(input.storyId);
    if (!plan) {
      throw new ValidationError(
        `Story ${input.storyId} has no plan; cannot start a partial rewrite`,
      );
    }
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

    story.bindExecution(executionArn);
    story.clearApproval();
    story.moveTo('CHAPTERS_GENERATING');
    await this.storyRepository.saveStory(story);

    return {
      storyId: input.storyId,
      executionArn,
      rewriteFromChapterIndex: input.rewriteFromChapterIndex,
    };
  }
}
