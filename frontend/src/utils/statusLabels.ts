import type { ApprovalStage, ChapterStatus, StoryStatus } from '../api/types';

export const STORY_STATUS_LABELS: Record<StoryStatus, string> = {
  SUBMITTED: '受付済み',
  METADATA_GENERATING: '設定書を生成中',
  AWAITING_METADATA_APPROVAL: '設定書の承認待ち',
  PLAN_GENERATING: 'プランを生成中',
  AWAITING_PLAN_APPROVAL: 'プランの承認待ち',
  CHAPTERS_GENERATING: '章本文を生成中',
  AWAITING_CHAPTER_APPROVAL: '章の承認待ち',
  AWAITING_CHAPTER_RECOVERY: '章の再生成が必要',
  AWAITING_FINAL_APPROVAL: '最終原稿の承認待ち',
  REVISING: '再生成中',
  COMPLETED: '完成',
  FAILED: '失敗',
};

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  PENDING: '未生成',
  DONE: '生成済み',
};

export const APPROVAL_STAGE_LABELS: Record<ApprovalStage, string> = {
  metadata: '設定書',
  plan: 'プラン',
  chapter: '章',
  final: '最終原稿',
};

export function isAwaitingApproval(status: StoryStatus): boolean {
  return status.startsWith('AWAITING_');
}

export function isTerminal(status: StoryStatus): boolean {
  return status === 'COMPLETED' || status === 'FAILED';
}

export function isInProgress(status: StoryStatus): boolean {
  return !isAwaitingApproval(status) && !isTerminal(status);
}
