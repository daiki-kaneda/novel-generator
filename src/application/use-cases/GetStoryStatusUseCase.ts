import { StoryStatus } from '../../domain/entities/Story';
import { ChapterOutline, ChapterStatus } from '../../domain/entities/Chapter';
import { ApprovalStage } from '../../domain/value-objects/ApprovalDecision';
import { StoryLength } from '../../domain/value-objects/StoryLength';
import { StoryRepository } from '../ports/StoryRepository';

export interface StoryStatusOutput {
  storyId: string;
  status: StoryStatus;
  requirePlanApproval: boolean;
  requireChapterApproval: boolean;
  length: StoryLength;
  taskStage?: ApprovalStage;
  currentChapterIndex?: number;
  plan?: {
    summary: string;
    theme: string;
    characters: string;
    chapters: ChapterOutline[];
  };
  chapters: Array<{
    index: number;
    title: string;
    status: ChapterStatus;
    summaryKeyPoints?: string;
  }>;
  finalUrl?: string;
}

/** 物語の現在の進行状況（プラン・各章の状態・最終URL）を取得する。 */
export class GetStoryStatusUseCase {
  constructor(private readonly storyRepository: StoryRepository) {}

  async execute(storyId: string): Promise<StoryStatusOutput> {
    const story = await this.storyRepository.getStory(storyId);
    const plan = await this.storyRepository.findPlan(storyId);
    const chapters = await this.storyRepository.getChapters(storyId);

    return {
      storyId: story.storyId,
      status: story.status,
      requirePlanApproval: story.request.requirePlanApproval,
      requireChapterApproval: story.request.requireChapterApproval,
      length: story.request.length,
      taskStage: story.taskStage,
      currentChapterIndex: story.currentChapterIndex,
      plan: plan
        ? {
            summary: plan.summary,
            theme: plan.theme,
            characters: plan.characters,
            chapters: [...plan.chapters],
          }
        : undefined,
      chapters: chapters.map((chapter) => ({
        index: chapter.index,
        title: chapter.title,
        status: chapter.status,
        summaryKeyPoints: chapter.summaryKeyPoints,
      })),
      finalUrl: story.finalUrl,
    };
  }
}
