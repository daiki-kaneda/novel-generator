/**
 * バックエンド（`src/application/use-cases/*`, `src/domain/entities/*`）のDTOに対応する型。
 * フロントエンドはバックエンドのTypeScriptパッケージに依存しない独立したアプリのため、
 * ここで構造をミラーリングして保持する。
 */

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

export type StoryFailureKind = 'FAILED' | 'TIMED_OUT' | 'ABORTED';

export type ApprovalStage = 'metadata' | 'plan' | 'chapter' | 'final';
export type ChapterStatus = 'PENDING' | 'DONE';
export type StoryLength = 'short' | 'medium';

export interface CharacterProfile {
  name: string;
  role: string;
  personality: string;
  background: string;
  goals: string;
  relationships: string;
  speechStyle?: string;
  appearance?: string;
}

export interface WorldSetting {
  geography: string;
  timePeriod: string;
  socialContext?: string;
}

export interface ChapterOutline {
  index: number;
  title: string;
  outline: string;
}

export interface RoughBeat {
  beatId: string;
  label: string;
  summary: string;
  chapterIndexes: number[];
}

export interface PlanProps {
  summary: string;
  theme: string;
  characters: CharacterProfile[];
  chapters: ChapterOutline[];
  roughBeats: RoughBeat[];
  forbiddenDevelopments: string[];
  revisionHistory: string[];
}

export type PlanSnapshotTrigger = 'initial' | 'chapter_revision';

export interface PlanSnapshot {
  afterChapterIndex: number;
  trigger: PlanSnapshotTrigger;
  recordedAt: string;
  plan: PlanProps;
}

export interface StoryStatusOutput {
  storyId: string;
  status: StoryStatus;
  requireMetadataApproval: boolean;
  requirePlanApproval: boolean;
  requireChapterApproval: boolean;
  requireFinalApproval: boolean;
  length: StoryLength;
  taskStage?: ApprovalStage;
  currentChapterIndex?: number;
  request: {
    overview: string;
    theme: string;
    characters: string;
    tone?: string;
    setting?: string;
  };
  metadata?: {
    overview: string;
    theme: string;
    tone: string;
    characters: CharacterProfile[];
    world: WorldSetting;
    timelineRules: string;
    consistencyNotes: string;
  };
  plan?: {
    summary: string;
    theme: string;
    characters: CharacterProfile[];
    chapters: ChapterOutline[];
    roughBeats: RoughBeat[];
    forbiddenDevelopments: string[];
  };
  planSnapshots: PlanSnapshot[];
  chapters: Array<{
    index: number;
    title: string;
    status: ChapterStatus;
    summaryKeyPoints?: string;
  }>;
  finalUrl?: string;
  failureKind?: StoryFailureKind;
  failureReason?: string;
}

export interface SubmitStoryInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  setting?: string;
  userEmail: string;
  requireMetadataApproval?: boolean;
  requirePlanApproval?: boolean;
  requireChapterApproval?: boolean;
  requireFinalApproval?: boolean;
  length?: StoryLength;
}

export interface SubmitStoryOutput {
  storyId: string;
}

export interface ChapterContentOutput {
  storyId: string;
  chapterIndex: number;
  title: string;
  contentUrl: string;
}

export interface DecisionInput {
  approved: boolean;
  /** 拒否時は必須。修正してほしい点。 */
  feedback?: string;
}

export interface FinalDecisionInput extends DecisionInput {
  /** 最終拒否時、この章番号から部分再生成する（省略時はバックエンドが最終章のみを既定にする）。 */
  rewriteFromChapterIndex?: number;
}

export interface StartRevisionInput {
  rewriteFromChapterIndex: number;
  feedback: string;
}

export interface StartRevisionOutput {
  storyId: string;
  executionArn: string;
  rewriteFromChapterIndex: number;
}
