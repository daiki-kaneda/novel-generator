import {
  DescribeExecutionCommand,
  SFNClient,
  StartExecutionCommand,
} from '@aws-sdk/client-sfn';
import {
  WorkflowExecutionStatus,
  WorkflowStarter,
} from '../../application/ports/WorkflowStarter';

/**
 * 指定の State Machine に対して StartExecution / DescribeExecution を発行するアダプタ。
 */
export class StepFunctionsWorkflowStarter implements WorkflowStarter {
  constructor(
    private readonly client: SFNClient,
    private readonly stateMachineArn: string,
  ) {}

  async startExecution(input: Record<string, unknown>): Promise<{ executionArn: string }> {
    const result = await this.client.send(
      new StartExecutionCommand({
        stateMachineArn: this.stateMachineArn,
        input: JSON.stringify(input),
      }),
    );
    if (!result.executionArn) {
      throw new Error('StartExecution did not return an executionArn');
    }
    return { executionArn: result.executionArn };
  }

  async getExecutionStatus(executionArn: string): Promise<WorkflowExecutionStatus> {
    const result = await this.client.send(
      new DescribeExecutionCommand({ executionArn }),
    );
    const status = result.status;
    if (
      status !== 'RUNNING' &&
      status !== 'SUCCEEDED' &&
      status !== 'FAILED' &&
      status !== 'TIMED_OUT' &&
      status !== 'ABORTED'
    ) {
      throw new Error(`Unexpected execution status: ${status}`);
    }
    return status;
  }
}
