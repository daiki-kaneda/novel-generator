import { StoryId } from '../value-objects/StoryId';
import { ApprovalStage } from '../value-objects/ApprovalDecision';
import { StoryLength, resolveStoryLength } from '../value-objects/StoryLength';
import { ValidationError } from '../errors/DomainErrors';

export type StoryStatus =
  | 'SUBMITTED'
  | 'PLAN_GENERATING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'CHAPTERS_GENERATING'
  | 'AWAITING_CHAPTER_APPROVAL'
  | 'AWAITING_FINAL_APPROVAL'
  | 'REVISING'
  | 'COMPLETED';

/** ユーザーが送信する物語生成リクエストの内容。 */
export interface StoryRequest {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  userEmail: string;
  /** プラン承認を求めるか。デフォルト true。 */
  requirePlanApproval: boolean;
  /** 各章の承認を求めるか。デフォルト false。 */
  requireChapterApproval: boolean;
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
  finalUrl?: string;
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
      request: {
        ...request,
        requirePlanApproval: request.requirePlanApproval ?? true,
        requireChapterApproval: request.requireChapterApproval ?? false,
        length: resolveStoryLength(request.length),
      },
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: StoryMetaProps): Story {
    const request = props.request ?? ({} as StoryRequest);
    return new Story({
      ...props,
      request: {
        ...request,
        requirePlanApproval: request.requirePlanApproval ?? true,
        requireChapterApproval: request.requireChapterApproval ?? false,
        length: resolveStoryLength(request.length),
      },
    });
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

  get finalUrl(): string | undefined {
    return this.props.finalUrl;
  }

  moveTo(status: StoryStatus): void {
    this.props.status = status;
    this.touch();
  }

  bindExecution(executionArn: string): void {
    this.props.executionArn = executionArn;
    this.touch();
  }

  /** waitForTaskTokenで承認待ちに入ったことを記録する。 */
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
      this.props.status = stage === 'plan' ? 'AWAITING_PLAN_APPROVAL' : 'AWAITING_FINAL_APPROVAL';
    }
    this.touch();
  }

  /** 承認/拒否の決定がStep Functionsに送信された後、待機状態を解除する。 */
  clearApproval(): void {
    this.props.currentTaskToken = undefined;
    this.props.taskStage = undefined;
    this.props.currentChapterIndex = undefined;
    this.touch();
  }

  complete(finalUrl: string): void {
    this.props.finalUrl = finalUrl;
    this.props.status = 'COMPLETED';
    this.touch();
  }

  private touch(): void {
    this.props.updatedAt = new Date().toISOString();
  }

  toProps(): StoryMetaProps {
    return { ...this.props, request: { ...this.props.request } };
  }
}
