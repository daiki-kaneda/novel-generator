export type ChapterStatus = 'PENDING' | 'DONE';

/** プランに含まれる、生成前の章の骨子。 */
export interface ChapterOutline {
  index: number;
  title: string;
  outline: string;
}

export interface ChapterProps extends ChapterOutline {
  status: ChapterStatus;
  s3Key?: string;
  summaryKeyPoints?: string;
  revisionInstruction?: string;
}

/**
 * 章の生成状態を表すエンティティ。
 * 本文そのものはS3に保存し、ここでは参照キーと次章生成用の要約のみを保持する。
 */
export class Chapter {
  private constructor(private props: ChapterProps) {}

  static fromOutline(outline: ChapterOutline): Chapter {
    return new Chapter({ ...outline, status: 'PENDING' });
  }

  static restore(props: ChapterProps): Chapter {
    return new Chapter({ ...props });
  }

  get index(): number {
    return this.props.index;
  }

  get title(): string {
    return this.props.title;
  }

  get outline(): string {
    return this.props.outline;
  }

  get status(): ChapterStatus {
    return this.props.status;
  }

  get s3Key(): string | undefined {
    return this.props.s3Key;
  }

  get summaryKeyPoints(): string | undefined {
    return this.props.summaryKeyPoints;
  }

  get revisionInstruction(): string | undefined {
    return this.props.revisionInstruction;
  }

  isDone(): boolean {
    return this.props.status === 'DONE';
  }

  /** 拒否フィードバックに基づき、この章を改訂対象としてマークする。 */
  requestRevision(instruction: string): void {
    this.props.revisionInstruction = instruction;
    this.props.status = 'PENDING';
  }

  /** 本文生成・要約生成が完了したことを記録する。 */
  complete(s3Key: string, summaryKeyPoints: string): void {
    this.props.s3Key = s3Key;
    this.props.summaryKeyPoints = summaryKeyPoints;
    this.props.status = 'DONE';
    this.props.revisionInstruction = undefined;
  }

  toProps(): ChapterProps {
    return { ...this.props };
  }
}
