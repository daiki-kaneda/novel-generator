/**
 * Step Functions などオーケストレーション実行の開始を抽象化するポート。
 */
export interface WorkflowStarter {
  startExecution(input: Record<string, unknown>): Promise<{ executionArn: string }>;
}
