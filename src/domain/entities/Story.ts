import { StoryId } from '../value-objects/StoryId';
import { ApprovalStage } from '../value-objects/ApprovalDecision';

export type StoryStatus =
  | 'SUBMITTED'
  | 'PLAN_GENERATING'
  | 'AWAITING_PLAN_APPROVAL'
  | 'CHAPTERS_GENERATING'
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
}

export interface StoryMetaProps {
  storyId: string;
  status: StoryStatus;
  request: StoryRequest;
  currentTaskToken?: string;
  taskStage?: ApprovalStage;
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
    const now = new Date().toISOString();
    return new Story({
      storyId: StoryId.generate().toString(),
      status: 'SUBMITTED',
      request,
      createdAt: now,
      updatedAt: now,
    });
  }

  static restore(props: StoryMetaProps): Story {
    return new Story({ ...props });
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
  awaitApproval(stage: ApprovalStage, taskToken: string): void {
    this.props.taskStage = stage;
    this.props.currentTaskToken = taskToken;
    this.props.status = stage === 'plan' ? 'AWAITING_PLAN_APPROVAL' : 'AWAITING_FINAL_APPROVAL';
    this.touch();
  }

  /** 承認/拒否の決定がStep Functionsに送信された後、待機状態を解除する。 */
  clearApproval(): void {
    this.props.currentTaskToken = undefined;
    this.props.taskStage = undefined;
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
