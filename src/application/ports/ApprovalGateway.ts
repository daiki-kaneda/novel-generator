import { ApprovalDecision } from '../../domain/value-objects/ApprovalDecision';

/**
 * Step Functionsの`waitForTaskToken`に対する決定通知を抽象化するポート。
 * 承認・拒否のいずれもStep Functions側では成功（SendTaskSuccess）として扱い、
 * ペイロード内の`approved`フラグでChoice状態が分岐できるようにする。
 */
export interface ApprovalGateway {
  sendDecision(taskToken: string, decision: ApprovalDecision): Promise<void>;
}
