import { ValidationError } from '../errors/DomainErrors';

/**
 * ワークフローが承認待ちになっている段階。
 */
export type ApprovalStage = 'metadata' | 'plan' | 'chapter' | 'final';

/**
 * ユーザーによる承認/拒否の決定。拒否時は修正点のフィードバックを必須とする。
 * 最終拒否時は rewriteFromChapterIndex で部分再生成の開始章を指定できる。
 */
export class ApprovalDecision {
  private constructor(
    public readonly approved: boolean,
    public readonly feedback?: string,
    public readonly rewriteFromChapterIndex?: number,
  ) {}

  static approve(): ApprovalDecision {
    return new ApprovalDecision(true);
  }

  static reject(feedback: string, rewriteFromChapterIndex?: number): ApprovalDecision {
    if (!feedback || feedback.trim().length === 0) {
      throw new ValidationError('Rejection requires feedback describing the requested changes');
    }
    if (
      rewriteFromChapterIndex !== undefined &&
      (!Number.isInteger(rewriteFromChapterIndex) || rewriteFromChapterIndex < 1)
    ) {
      throw new ValidationError('rewriteFromChapterIndex must be a positive integer');
    }
    return new ApprovalDecision(false, feedback, rewriteFromChapterIndex);
  }
}
