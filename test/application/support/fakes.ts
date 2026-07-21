import { StoryRepository } from '../../../src/application/ports/StoryRepository';
import { ChapterContentStorage } from '../../../src/application/ports/ChapterContentStorage';
import {
  NovelTextGenerator,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
  ProposeRevisionPlanInput,
} from '../../../src/application/ports/NovelTextGenerator';
import { ApprovalGateway } from '../../../src/application/ports/ApprovalGateway';
import { NotificationSender } from '../../../src/application/ports/NotificationSender';
import { RequestQueue } from '../../../src/application/ports/RequestQueue';
import { Story } from '../../../src/domain/entities/Story';
import { Plan } from '../../../src/domain/entities/Plan';
import { Chapter } from '../../../src/domain/entities/Chapter';
import { NotFoundError } from '../../../src/domain/errors/DomainErrors';
import { ApprovalDecision } from '../../../src/domain/value-objects/ApprovalDecision';
import { ChapterRevisionInstruction } from '../../../src/domain/services/RevisionScopePolicy';

/**
 * ユースケースをAWSに依存せずテストするためのインメモリなFake実装群。
 * クリーンアーキテクチャによりポート（インターフェース）を経由しているため、
 * 本物のDynamoDB/S3/Bedrock等の代わりにこれらを注入するだけでユニットテストできる。
 */
export class FakeStoryRepository implements StoryRepository {
  private readonly stories = new Map<string, Story>();
  private readonly plans = new Map<string, Plan>();
  private readonly chapters = new Map<string, Map<number, Chapter>>();

  async createStory(story: Story): Promise<void> {
    this.stories.set(story.storyId, story);
  }

  async getStory(storyId: string): Promise<Story> {
    const story = this.stories.get(storyId);
    if (!story) {
      throw new NotFoundError(`Story ${storyId} not found`);
    }
    return story;
  }

  async saveStory(story: Story): Promise<void> {
    this.stories.set(story.storyId, story);
  }

  async savePlan(storyId: string, plan: Plan): Promise<void> {
    this.plans.set(storyId, plan);
  }

  async getPlan(storyId: string): Promise<Plan> {
    const plan = await this.findPlan(storyId);
    if (!plan) {
      throw new NotFoundError(`Plan for story ${storyId} not found`);
    }
    return plan;
  }

  async findPlan(storyId: string): Promise<Plan | null> {
    return this.plans.get(storyId) ?? null;
  }

  async initializeChapters(storyId: string, chapters: Chapter[]): Promise<void> {
    const byIndex = new Map<number, Chapter>();
    for (const chapter of chapters) {
      byIndex.set(chapter.index, chapter);
    }
    this.chapters.set(storyId, byIndex);
  }

  async saveChapter(storyId: string, chapter: Chapter): Promise<void> {
    const byIndex = this.chapters.get(storyId) ?? new Map<number, Chapter>();
    byIndex.set(chapter.index, chapter);
    this.chapters.set(storyId, byIndex);
  }

  async getChapter(storyId: string, index: number): Promise<Chapter> {
    const chapter = await this.findChapter(storyId, index);
    if (!chapter) {
      throw new NotFoundError(`Chapter ${index} for story ${storyId} not found`);
    }
    return chapter;
  }

  async findChapter(storyId: string, index: number): Promise<Chapter | null> {
    return this.chapters.get(storyId)?.get(index) ?? null;
  }

  async getChapters(storyId: string): Promise<Chapter[]> {
    const byIndex = this.chapters.get(storyId);
    if (!byIndex) {
      return [];
    }
    return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
  }
}

export class FakeChapterContentStorage implements ChapterContentStorage {
  private readonly texts = new Map<string, string>();

  async saveChapterText(storyId: string, chapterIndex: number, text: string): Promise<string> {
    const key = `stories/${storyId}/chapters/${chapterIndex}.txt`;
    this.texts.set(key, text);
    return key;
  }

  async getChapterText(_storyId: string, s3Key: string): Promise<string> {
    const text = this.texts.get(s3Key);
    if (text === undefined) {
      throw new NotFoundError(`No fake content stored for key ${s3Key}`);
    }
    return text;
  }

  async saveFinalText(storyId: string, text: string): Promise<string> {
    const key = `stories/${storyId}/final.txt`;
    this.texts.set(key, text);
    return key;
  }

  async createPresignedUrl(s3Key: string, expirySeconds: number): Promise<string> {
    return `https://example.com/${s3Key}?expires=${expirySeconds}`;
  }
}

export class FakeNovelTextGenerator implements NovelTextGenerator {
  generatePlanResult: GeneratedPlan = {
    summary: 'fake summary',
    theme: 'fake theme',
    characters: 'fake characters',
    chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
  };
  generateChapterTextResult = 'fake chapter text';
  summarizeChapterResult = 'fake chapter summary';
  proposeRevisionPlanResult: ChapterRevisionInstruction[] = [];

  async generatePlan(_input: GeneratePlanInput): Promise<GeneratedPlan> {
    return this.generatePlanResult;
  }

  async generateChapterText(_input: GenerateChapterTextInput): Promise<string> {
    return this.generateChapterTextResult;
  }

  async summarizeChapter(_chapterText: string): Promise<string> {
    return this.summarizeChapterResult;
  }

  async proposeRevisionPlan(
    _input: ProposeRevisionPlanInput,
  ): Promise<ChapterRevisionInstruction[]> {
    return this.proposeRevisionPlanResult;
  }
}

export class FakeApprovalGateway implements ApprovalGateway {
  readonly sentDecisions: Array<{ taskToken: string; decision: ApprovalDecision }> = [];

  async sendDecision(taskToken: string, decision: ApprovalDecision): Promise<void> {
    this.sentDecisions.push({ taskToken, decision });
  }
}

export class FakeNotificationSender implements NotificationSender {
  readonly sentEmails: Array<{ toEmail: string; storyId: string; downloadUrl: string }> = [];

  async sendCompletionEmail(toEmail: string, storyId: string, downloadUrl: string): Promise<void> {
    this.sentEmails.push({ toEmail, storyId, downloadUrl });
  }
}

export class FakeRequestQueue implements RequestQueue {
  readonly enqueued: string[] = [];

  async enqueueStoryRequest(storyId: string): Promise<void> {
    this.enqueued.push(storyId);
  }
}
