export type WorkflowExecutionStatus =
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'TIMED_OUT'
  | 'ABORTED';

/**
 * Step Functions などオーケストレーション実行の開始・状態照会を抽象化するポート。
 */
export interface WorkflowStarter {
  startExecution(input: Record<string, unknown>): Promise<{ executionArn: string }>;
  getExecutionStatus(executionArn: string): Promise<WorkflowExecutionStatus>;
}
