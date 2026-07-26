import { ValidationError } from '../errors/DomainErrors';

/**
 * ワークフローが承認待ちになっている段階。
 */
export type ApprovalStage = 'metadata' | 'plan' | 'chapter' | 'final';

/**
 * ユーザーによる承認/拒否の決定。拒否時は修正点のフィードバックを必須とする。
 */
export class ApprovalDecision {
  private constructor(
    public readonly approved: boolean,
    public readonly feedback?: string,
  ) {}

  static approve(): ApprovalDecision {
    return new ApprovalDecision(true);
  }

  static reject(feedback: string): ApprovalDecision {
    if (!feedback || feedback.trim().length === 0) {
      throw new ValidationError('Rejection requires feedback describing the requested changes');
    }
    return new ApprovalDecision(false, feedback);
  }
}
