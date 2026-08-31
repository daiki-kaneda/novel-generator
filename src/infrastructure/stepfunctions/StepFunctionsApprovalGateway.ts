import { SFNClient, SendTaskFailureCommand, SendTaskSuccessCommand } from '@aws-sdk/client-sfn';
import { ApprovalGateway } from '../../application/ports/ApprovalGateway';
import { ApprovalDecision } from '../../domain/value-objects/ApprovalDecision';

/**
 * Step Functionsの`waitForTaskToken`タスクに決定を返すアダプタ。
 * 承認・拒否のどちらも`SendTaskSuccess`として送信し、ペイロード内の`approved`で
 * ワークフロー側のChoice状態が分岐できるようにする（拒否をタスク失敗として扱わない）。
 * 生成失敗からの回復をユーザーが中止した場合のみ`SendTaskFailure`を使う。
 */
export class StepFunctionsApprovalGateway implements ApprovalGateway {
  constructor(private readonly client: SFNClient) {}

  async sendDecision(taskToken: string, decision: ApprovalDecision): Promise<void> {
    await this.client.send(
      new SendTaskSuccessCommand({
        taskToken,
        output: JSON.stringify({
          approved: decision.approved,
          feedback: decision.feedback,
          rewriteFromChapterIndex: decision.rewriteFromChapterIndex,
        }),
      }),
    );
  }

  async sendFailure(taskToken: string, error: string, cause: string): Promise<void> {
    await this.client.send(
      new SendTaskFailureCommand({
        taskToken,
        error,
        cause,
      }),
    );
  }
}
