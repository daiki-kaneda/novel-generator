import { StoryFailureKind, StoryStatus } from '../../domain/entities/Story';
import { ChapterOutline, ChapterStatus } from '../../domain/entities/Chapter';
import {
  CharacterProfile,
  WorldSetting,
} from '../../domain/entities/StoryMetadata';
import { PlanProps, PlanSnapshotTrigger, RoughBeat } from '../../domain/entities/Plan';
import { ApprovalPurpose, ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { ChapterGenerationError } from '../../domain/value-objects/ChapterGenerationError';
import { StoryLength } from '../../domain/value-objects/StoryLength';
import { StoryRepository } from '../ports/StoryRepository';

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
  approvalPurpose?: ApprovalPurpose;
  lastChapterError?: ChapterGenerationError;
  /** ユーザー初期リクエスト（シード）。設定書の正本ではない。 */
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
  /** Plan 変遷スナップショット（初期 + 各章改訂後）。デバッグ・品質確認用。 */
  planSnapshots: Array<{
    afterChapterIndex: number;
    trigger: PlanSnapshotTrigger;
    recordedAt: string;
    plan: PlanProps;
  }>;
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

/** 物語の現在の進行状況（メタデータ・プラン・各章の状態・最終URL）を取得する。 */
export class GetStoryStatusUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(storyId: string, callerId: string): Promise<StoryStatusOutput> {
    const story = await this.storyRepository.getStory(storyId);
    story.assertOwnedBy(callerId);
    const metadata = await this.storyRepository.findMetadata(storyId);
    const plan = await this.storyRepository.findPlan(storyId);
    const planSnapshots = await this.storyRepository.listPlanSnapshots(storyId);
    const chapters = await this.storyRepository.getChapters(storyId);

    return {
      storyId: story.storyId,
      status: story.status,
      requireMetadataApproval: story.request.requireMetadataApproval,
      requirePlanApproval: story.request.requirePlanApproval,
      requireChapterApproval: story.request.requireChapterApproval,
      requireFinalApproval: story.request.requireFinalApproval,
      length: story.request.length,
      taskStage: story.taskStage,
      currentChapterIndex: story.currentChapterIndex,
      approvalPurpose: story.approvalPurpose,
      lastChapterError: story.lastChapterError
        ? {
            chapterIndex: story.lastChapterError.chapterIndex,
            kind: story.lastChapterError.kind,
            message: story.lastChapterError.message,
            contradictions: story.lastChapterError.contradictions
              ? story.lastChapterError.contradictions.map((item) => ({ ...item }))
              : undefined,
          }
        : undefined,
      request: {
        overview: story.request.overview,
        theme: story.request.theme,
        characters: story.request.characters,
        tone: story.request.tone,
        setting: story.request.setting,
      },
      metadata: metadata
        ? {
            overview: metadata.overview,
            theme: metadata.theme,
            tone: metadata.tone,
            characters: metadata.characters.map((c) => ({ ...c })),
            world: { ...metadata.world },
            timelineRules: metadata.timelineRules,
            consistencyNotes: metadata.consistencyNotes,
          }
        : undefined,
      plan: plan
        ? {
            summary: plan.summary,
            theme: plan.theme,
            characters: plan.characters.map((c) => ({ ...c })),
            chapters: [...plan.chapters],
            roughBeats: plan.roughBeats.map((b) => ({
              ...b,
              chapterIndexes: [...b.chapterIndexes],
            })),
            forbiddenDevelopments: [...plan.forbiddenDevelopments],
          }
        : undefined,
      planSnapshots: planSnapshots.map((snapshot) => snapshot.toProps()),
      chapters: chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        status: chapter.status,
        summaryKeyPoints: chapter.summaryKeyPoints,
      })),
      finalUrl: story.finalUrl,
      failureKind: story.failureKind,
      failureReason: story.failureReason,
    };
  }
}
