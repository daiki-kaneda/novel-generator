/**
 * ワークフローが承認待ち（waitForTaskToken）になっている段階。
 */
export type ApprovalStage = 'plan' | 'final';

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
      throw new Error('Rejection requires feedback describing the requested changes');
    }
    return new ApprovalDecision(false, feedback);
  }
}
