import { ChapterOutline } from './Chapter';
import { ValidationError } from '../errors/DomainErrors';

export interface PlanProps {
  summary: string;
  theme: string;
  characters: string;
  chapters: ChapterOutline[];
  /** これまでにユーザーから寄せられたプラン修正フィードバックの履歴（再生成の根拠として保持）。 */
  revisionHistory: string[];
}

/**
 * 承認対象となる物語のプラン（概要・テーマ・登場人物・章構成）。
 */
export class Plan {
  private constructor(private props: PlanProps) {}

  static create(props: Omit<PlanProps, 'revisionHistory'>): Plan {
    if (props.chapters.length === 0) {
      throw new ValidationError('Plan must contain at least one chapter');
    }
    return new Plan({ ...props, revisionHistory: [] });
  }

  static restore(props: PlanProps): Plan {
    return new Plan({ ...props });
  }

  get summary(): string {
    return this.props.summary;
  }

  get theme(): string {
    return this.props.theme;
  }

  get characters(): string {
    return this.props.characters;
  }

  get chapters(): readonly ChapterOutline[] {
    return this.props.chapters;
  }

  get revisionHistory(): readonly string[] {
    return this.props.revisionHistory;
  }

  /** プラン拒否時のフィードバックを履歴に記録する（次回生成のプロンプトに使う）。 */
  recordRejection(feedback: string): void {
    this.props.revisionHistory.push(feedback);
  }

  toProps(): PlanProps {
    return {
      ...this.props,
      chapters: [...this.props.chapters],
      revisionHistory: [...this.props.revisionHistory],
    };
  }
}
