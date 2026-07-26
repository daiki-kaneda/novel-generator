import { ApprovalDecision } from '../../domain/value-objects/ApprovalDecision';

/**
 * 承認待ちワークフローへの決定通知を抽象化するポート。
 * 承認・拒否のいずれもコールバックとして通知し、ペイロード内の`approved`で後続分岐できるようにする。
 */
export interface ApprovalGateway {
  sendDecision(taskToken: string, decision: ApprovalDecision): Promise<void>;
}
