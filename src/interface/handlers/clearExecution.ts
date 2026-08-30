import { container } from '../composition/container';
import type { ExecutionTerminalStatus } from '../../application/use-cases/ClearExecutionUseCase';

/**
 * Step Functions Execution Status Change (EventBridge) の detail 抜粋。
 * input は開始時 JSON 文字列。
 */
export interface StepFunctionsExecutionStatusChangeDetail {
  executionArn: string;
  stateMachineArn: string;
  status: string;
  input?: string;
}

export interface EventBridgeSfnStatusChangeEvent {
  'detail-type'?: string;
  source?: string;
  detail: StepFunctionsExecutionStatusChangeDetail;
}

function extractStoryId(input?: string): string | undefined {
  if (!input) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(input) as { storyId?: unknown };
    return typeof parsed.storyId === 'string' ? parsed.storyId : undefined;
  } catch {
    return undefined;
  }
}

function parseExecutionStatus(status: string | undefined): ExecutionTerminalStatus | undefined {
  if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
    return status;
  }
  return undefined;
}

/** ワークフロー終端時に executionArn ロックを解放し、失敗終端なら Story を FAILED にする。 */
export const handler = async (
  event: EventBridgeSfnStatusChangeEvent,
): Promise<{ storyId: string; cleared: boolean } | { skipped: true; reason: string }> => {
  const detail = event.detail;
  const storyId = extractStoryId(detail?.input);
  if (!storyId || !detail?.executionArn) {
    return { skipped: true, reason: 'missing storyId or executionArn' };
  }

  return container.clearExecutionUseCase().execute({
    storyId,
    executionArn: detail.executionArn,
    executionStatus: parseExecutionStatus(detail.status),
  });
};
