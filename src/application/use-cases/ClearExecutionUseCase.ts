import { StoryFailureKind } from '../../domain/entities/Story';
import { StoryRepository } from '../ports/StoryRepository';

/** Step Functions 実行の終端ステータス（EventBridge detail.status）。 */
export type ExecutionTerminalStatus = 'SUCCEEDED' | StoryFailureKind;

export interface ClearExecutionInput {
  storyId: string;
  executionArn: string;
  /**
   * EventBridge が渡す実行終端ステータス。
   * 失敗系ならロック解除と同時に Story を FAILED にする。
   * 省略時・SUCCEEDED はロック解除のみ（Finalize が COMPLETED を書く）。
   */
  executionStatus?: ExecutionTerminalStatus;
}

export interface ClearExecutionOutput {
  storyId: string;
  cleared: boolean;
}

const FAILURE_REASONS: Record<StoryFailureKind, string> = {
  FAILED: '生成ワークフローが失敗しました',
  TIMED_OUT: 'タイムアウトしました。承認待ちが長すぎたか、生成が時間切れです',
  ABORTED: '実行が中断されました',
};

function isFailureStatus(status: ExecutionTerminalStatus | undefined): status is StoryFailureKind {
  return status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED';
}

/**
 * ワークフロー終端時に、一致する executionArn だけを Story から外してロックを解放する。
 * 別実行の ARN が既に載っている場合は触らない。
 *
 * 失敗終端（FAILED / TIMED_OUT / ABORTED）では、ロック解除と同時に Story を FAILED にする。
 * 成功終端では status を変えない（COMPLETED は FinalizeNovelUseCase が書く）。
 * 既に COMPLETED の Story は失敗で上書きしない。
 */
export class ClearExecutionUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(input: ClearExecutionInput): Promise<ClearExecutionOutput> {
    const story = await this.storyRepository.getStory(input.storyId);
    if (story.executionArn !== input.executionArn) {
      return { storyId: input.storyId, cleared: false };
    }

    if (isFailureStatus(input.executionStatus) && story.status !== 'COMPLETED') {
      story.fail(input.executionStatus, FAILURE_REASONS[input.executionStatus]);
    }

    story.clearExecution();
    await this.storyRepository.saveStory(story);
    return { storyId: input.storyId, cleared: true };
  }
}
