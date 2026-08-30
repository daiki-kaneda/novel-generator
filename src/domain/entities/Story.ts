import { StoryId } from '../value-objects/StoryId';
import { ApprovalStage } from '../value-objects/ApprovalDecision';
import { StoryLength, resolveStoryLength } from '../value-objects/StoryLength';
import { ValidationError } from '../errors/DomainErrors';

export type StoryStatus =
  | 'SUBMITTED'
  | 'METADATA_GENERATING'
  | 'AWAITING_METADATA_APPROVAL'
  | 'PLAN_GENERATING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'CHAPTERS_GENERATING'
  | 'AWAITING_CHAPTER_APPROVAL'
  | 'AWAITING_FINAL_APPROVAL'
  | 'REVISING'
  | 'COMPLETED'
  | 'FAILED';

/** Step Functions 実行の失敗終端。EventBridge の detail.status に対応する。 */
export type StoryFailureKind = 'FAILED' | 'TIMED_OUT' | 'ABORTED';

/** ユーザーが送信する物語生成リクエストの内容（シード）。設定書の正本ではない。 */
export interface StoryRequest {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  /** 地理・時代などの任意ヒント。 */
  setting?: string;
  userEmail: string;
  /** メタデータ（設定書）承認を求めるか。デフォルト true。 */
  requireMetadataApproval: boolean;
  /** プラン承認を求めるか。デフォルト true。 */
  requirePlanApproval: boolean;
  /** 各章の承認を求めるか。デフォルト false。 */
  requireChapterApproval: boolean;
  /**
   * 最終原稿の承認を求めるか。
   * 省略時は !requireChapterApproval（章承認オフなら最終承認オン、という従来挙動を維持）。
   */
  requireFinalApproval: boolean;
  /** 短編 / 中編。デフォルト short。 */
  length: StoryLength;
}

export interface StoryMetaProps {
  storyId: string;
  status: StoryStatus;
  request: StoryRequest;
  currentTaskToken?: string;
  taskStage?: ApprovalStage;
  /** 章承認待ちのとき、対象章のindex。 */
  currentChapterIndex?: number;
  executionArn?: string;
  /**
   * 最終原稿のS3キー。COMPLETED 後の再発行に使う。
   * 旧レコードは未設定のことがあり、その場合は `stories/{storyId}/final.txt` に倒す。
   */
  finalKey?: string;
  /** 旧データ互換。期限付きURLであり、新規の complete では書かない。 */
  finalUrl?: string;
  /** ワークフローが失敗終端したときの種別。成功・再実行後は未設定。 */
  failureKind?: StoryFailureKind;
  /** ユーザー向けの失敗理由。 */
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 物語生成ワークフロー1件分の状態を表す集約ルート。
 * プラン・章の詳細はそれぞれ Plan / Chapter エンティティが持ち、
 * Story はワークフロー全体の進行状態（承認待ちの有無、taskToken等）を管理する。
 */
export class Story {
  private constructor(private props: StoryMetaProps) {}

  static submit(request: StoryRequest): Story {
    Story.validateRequest(request);
    const now = new Date().toISOString();
    return new Story({
      storyId: StoryId.generate().toString(),
      status: 'SUBMITTED',
      request: Story.normalizeRequest(request),
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: StoryMetaProps): Story {
    const request = props.request ?? ({} as StoryRequest);
    return new Story({
      ...props,
      request: Story.normalizeRequest(request),
    });
  }

  /** 承認フラグ・長さのデフォルトを正規化する。 */
  private static normalizeRequest(request: StoryRequest): StoryRequest {
    const requireChapterApproval = request.requireChapterApproval ?? false;
    return {
      ...request,
      requireMetadataApproval: request.requireMetadataApproval ?? true,
      requirePlanApproval: request.requirePlanApproval ?? true,
      requireChapterApproval,
      requireFinalApproval: request.requireFinalApproval ?? !requireChapterApproval,
      length: resolveStoryLength(request.length),
    };
  }

  private static validateRequest(request: StoryRequest): void {
    const requiredFields: Array<[keyof StoryRequest, string]> = [
      ['overview', '概要'],
      ['theme', 'テーマ'],
      ['characters', '登場人物'],
      ['userEmail', 'メールアドレス'],
    ];
    for (const [field, label] of requiredFields) {
      if (!request[field] || String(request[field]).trim().length === 0) {
        throw new ValidationError(`${label}は必須です`);
      }
    }
    if (!request.userEmail.includes('@')) {
      throw new ValidationError('メールアドレスの形式が正しくありません');
    }
  }

  get storyId(): string {
    return this.props.storyId;
  }

  get status(): StoryStatus {
    return this.props.status;
  }

  get request(): StoryRequest {
    return this.props.request;
  }

  get currentTaskToken(): string | undefined {
    return this.props.currentTaskToken;
  }

  get taskStage(): ApprovalStage | undefined {
    return this.props.taskStage;
  }

  get currentChapterIndex(): number | undefined {
    return this.props.currentChapterIndex;
  }

  get executionArn(): string | undefined {
    return this.props.executionArn;
  }

  get finalKey(): string | undefined {
    return this.props.finalKey;
  }

  get finalUrl(): string | undefined {
    return this.props.finalUrl;
  }

  /**
   * 完成原稿のS3キー。新規は `finalKey`、旧COMPLETEDレコードは決定的キーへ倒す。
   * COMPLETED 以外では undefined。
   */
  resolveFinalKey(): string | undefined {
    if (this.props.status !== 'COMPLETED') {
      return undefined;
    }
    return this.props.finalKey ?? `stories/${this.props.storyId}/final.txt`;
  }

  get failureKind(): StoryFailureKind | undefined {
    return this.props.failureKind;
  }

  get failureReason(): string | undefined {
    return this.props.failureReason;
  }

  moveTo(status: StoryStatus): void {
    if (status === 'FAILED') {
      throw new ValidationError('Use Story.fail() to record a workflow failure');
    }
    this.props.status = status;
    this.clearFailureFields();
    this.touch();
  }

  /** 実行中ワークフローの ARN をロックとして記録する。 */
  bindExecution(executionArn: string): void {
    this.props.executionArn = executionArn;
    this.clearFailureFields();
    this.touch();
  }

  /** ワークフロー終端後に実行中ロックを解除する。 */
  clearExecution(): void {
    this.props.executionArn = undefined;
    this.touch();
  }

  /**
   * ワークフロー失敗終端を記録する。無効になった承認トークンも捨てる。
   * 実行中ロック（executionArn）は外さない。ロック解除は ClearExecutionUseCase の責務。
   */
  fail(kind: StoryFailureKind, reason: string): void {
    if (this.props.status === 'COMPLETED') {
      throw new ValidationError('A completed story cannot be marked as failed');
    }
    this.props.status = 'FAILED';
    this.props.failureKind = kind;
    this.props.failureReason = reason;
    this.props.currentTaskToken = undefined;
    this.props.taskStage = undefined;
    this.props.currentChapterIndex = undefined;
    this.touch();
  }

  /** 承認待ちに入ったことを記録する（コールバックトークンを保持）。 */
  awaitApproval(stage: ApprovalStage, taskToken: string, chapterIndex?: number): void {
    this.props.taskStage = stage;
    this.props.currentTaskToken = taskToken;
    if (stage === 'chapter') {
      if (chapterIndex === undefined) {
        throw new ValidationError('Chapter approval requires a chapterIndex');
      }
      this.props.currentChapterIndex = chapterIndex;
      this.props.status = 'AWAITING_CHAPTER_APPROVAL';
    } else {
      this.props.currentChapterIndex = undefined;
      if (stage === 'metadata') {
        this.props.status = 'AWAITING_METADATA_APPROVAL';
      } else if (stage === 'plan') {
        this.props.status = 'AWAITING_PLAN_APPROVAL';
      } else {
        this.props.status = 'AWAITING_FINAL_APPROVAL';
      }
    }
    this.touch();
  }

  /** 承認/拒否の決定通知後、待機状態を解除する。 */
  clearApproval(): void {
    this.props.currentTaskToken = undefined;
    this.props.taskStage = undefined;
    this.props.currentChapterIndex = undefined;
    this.touch();
  }

  /** 最終原稿のS3キーを記録して完成にする。期限付きURLは永続化しない。 */
  complete(finalKey: string): void {
    if (!finalKey.trim()) {
      throw new ValidationError('finalKey is required to complete a story');
    }
    this.props.finalKey = finalKey;
    this.props.finalUrl = undefined;
    this.props.status = 'COMPLETED';
    this.clearFailureFields();
    this.touch();
  }

  private clearFailureFields(): void {
    this.props.failureKind = undefined;
    this.props.failureReason = undefined;
  }

  private touch(): void {
    this.props.updatedAt = new Date().toISOString();
  }

  toProps(): StoryMetaProps {
    return { ...this.props, request: { ...this.props.request } };
  }
}
