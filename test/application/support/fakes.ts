import { StoryRepository } from '../../../src/application/ports/StoryRepository';
import { ChapterContentStorage } from '../../../src/application/ports/ChapterContentStorage';
import { WorldStateRepository } from '../../../src/application/ports/WorldStateRepository';
import {
  NovelTextGenerator,
  GenerateMetadataInput,
  GeneratedMetadata,
  GeneratePlanInput,
  GeneratedPlan,
  GenerateChapterTextInput,
  RevisePlanInput,
  RevisedPlan,
  LlmCallContext,
  ExtractAtomicFactsInput,
  ExtractedAtomicFacts,
  DetectContradictionsInput,
  ContradictionCheckResult,
  ExpandChapterOutlineInput,
  ExpandedChapterOutline,
  RealignFuturePlanInput,
  RealignedFuturePlan,
} from '../../../src/application/ports/NovelTextGenerator';
import { ApprovalGateway } from '../../../src/application/ports/ApprovalGateway';
import {
  ApprovalRequestedEmailInput,
  NotificationSender,
} from '../../../src/application/ports/NotificationSender';
import { RequestQueue } from '../../../src/application/ports/RequestQueue';
import { WorkflowExecutionStatus, WorkflowStarter } from '../../../src/application/ports/WorkflowStarter';
import { Story } from '../../../src/domain/entities/Story';
import { CharacterProfile, StoryMetadata } from '../../../src/domain/entities/StoryMetadata';
import { Plan, PlanSnapshot } from '../../../src/domain/entities/Plan';
import { Chapter } from '../../../src/domain/entities/Chapter';
import {
  AtomicFact,
  WorldEntity,
  WorldStateSnapshot,
  isFactActiveAt,
} from '../../../src/domain/entities/WorldState';
import { NotFoundError } from '../../../src/domain/errors/DomainErrors';
import { ApprovalDecision } from '../../../src/domain/value-objects/ApprovalDecision';
import { StoryLength } from '../../../src/domain/value-objects/StoryLength';

export const SAMPLE_PLAN_CHARACTERS: CharacterProfile[] = [
  {
    name: 'Hero',
    role: '主人公',
    personality: '勇敢',
    background: '田舎育ち',
    goals: '平和を守る',
    relationships: '導師の弟子',
    appearance: '短髪で旅装の少年',
  },
];

/**
 * ユースケースをAWSに依存せずテストするためのインメモリなFake実装群。
 */
export class FakeStoryRepository implements StoryRepository {
  private readonly stories = new Map<string, Story>();
  private readonly metadataByStory = new Map<string, StoryMetadata>();
  private readonly plans = new Map<string, Plan>();
  private readonly planSnapshots = new Map<string, Map<number, PlanSnapshot>>();
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

  async saveMetadata(storyId: string, metadata: StoryMetadata): Promise<void> {
    this.metadataByStory.set(storyId, metadata);
  }

  async getMetadata(storyId: string): Promise<StoryMetadata> {
    const metadata = await this.findMetadata(storyId);
    if (!metadata) {
      throw new NotFoundError(`Metadata for story ${storyId} not found`);
    }
    return metadata;
  }

  async findMetadata(storyId: string): Promise<StoryMetadata | null> {
    return this.metadataByStory.get(storyId) ?? null;
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

  async savePlanSnapshot(storyId: string, snapshot: PlanSnapshot): Promise<void> {
    const byIndex = this.planSnapshots.get(storyId) ?? new Map<number, PlanSnapshot>();
    byIndex.set(snapshot.afterChapterIndex, PlanSnapshot.restore(snapshot.toProps()));
    this.planSnapshots.set(storyId, byIndex);
  }

  async listPlanSnapshots(storyId: string): Promise<PlanSnapshot[]> {
    const byIndex = this.planSnapshots.get(storyId);
    if (!byIndex) {
      return [];
    }
    return Array.from(byIndex.values())
      .sort((a, b) => a.afterChapterIndex - b.afterChapterIndex)
      .map((snapshot) => PlanSnapshot.restore(snapshot.toProps()));
  }

  async clearPlanSnapshots(storyId: string): Promise<void> {
    this.planSnapshots.delete(storyId);
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

export class FakeWorldStateRepository implements WorldStateRepository {
  private readonly entities = new Map<string, Map<string, WorldEntity>>();
  private readonly facts = new Map<string, Map<string, AtomicFact>>();
  private readonly snapshots = new Map<string, Map<number, WorldStateSnapshot>>();

  async listEntities(storyId: string): Promise<WorldEntity[]> {
    return Array.from(this.entities.get(storyId)?.values() ?? []).map((e) => ({ ...e }));
  }

  async upsertEntities(storyId: string, entities: WorldEntity[]): Promise<void> {
    const byId = this.entities.get(storyId) ?? new Map<string, WorldEntity>();
    for (const entity of entities) {
      byId.set(entity.entityId, { ...entity });
    }
    this.entities.set(storyId, byId);
  }

  async listActiveFacts(storyId: string, asOfChapterIndex: number): Promise<AtomicFact[]> {
    const all = await this.listAllFacts(storyId);
    return all.filter((fact) => isFactActiveAt(fact, asOfChapterIndex));
  }

  async listAllFacts(storyId: string): Promise<AtomicFact[]> {
    return Array.from(this.facts.get(storyId)?.values() ?? []).map((f) => ({
      ...f,
      entityIds: [...f.entityIds],
      supersedes: f.supersedes ? [...f.supersedes] : undefined,
    }));
  }

  async appendFacts(storyId: string, facts: AtomicFact[]): Promise<void> {
    const byId = this.facts.get(storyId) ?? new Map<string, AtomicFact>();
    for (const fact of facts) {
      byId.set(fact.factId, {
        ...fact,
        entityIds: [...fact.entityIds],
        supersedes: fact.supersedes ? [...fact.supersedes] : undefined,
      });
    }
    this.facts.set(storyId, byId);
  }

  async closeFacts(storyId: string, factIds: string[], closedAtChapter: number): Promise<void> {
    const byId = this.facts.get(storyId);
    if (!byId) {
      return;
    }
    for (const factId of factIds) {
      const fact = byId.get(factId);
      if (fact) {
        byId.set(factId, { ...fact, validToChapter: closedAtChapter });
      }
    }
  }

  async saveSnapshot(storyId: string, snapshot: WorldStateSnapshot): Promise<void> {
    const byIndex = this.snapshots.get(storyId) ?? new Map<number, WorldStateSnapshot>();
    byIndex.set(snapshot.afterChapterIndex, WorldStateSnapshot.restore(snapshot.toProps()));
    this.snapshots.set(storyId, byIndex);
  }

  async getSnapshot(storyId: string, afterChapterIndex: number): Promise<WorldStateSnapshot | null> {
    return this.snapshots.get(storyId)?.get(afterChapterIndex) ?? null;
  }

  async rollbackToSnapshot(storyId: string, afterChapterIndex: number): Promise<void> {
    const snapshot = await this.getSnapshot(storyId, afterChapterIndex);
    await this.clearWorldState(storyId);
    if (!snapshot) {
      return;
    }
    await this.upsertEntities(storyId, snapshot.entities);
    await this.appendFacts(storyId, snapshot.facts);
    await this.saveSnapshot(storyId, snapshot);
  }

  async clearWorldState(storyId: string): Promise<void> {
    this.entities.delete(storyId);
    this.facts.delete(storyId);
    this.snapshots.delete(storyId);
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

  async deleteChapterText(_storyId: string, s3Key: string): Promise<void> {
    this.texts.delete(s3Key);
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
  generateMetadataResult: GeneratedMetadata = {
    overview: 'fake overview',
    theme: 'fake theme',
    tone: 'fake tone',
    characters: [
      {
        name: 'Hero',
        role: '主人公',
        personality: '勇敢',
        background: '田舎育ち',
        goals: '平和を守る',
        relationships: '導師の弟子',
        appearance: '短髪で旅装の少年',
      },
    ],
    world: {
      geography: '北方の王国と南の港町',
      timePeriod: '中世風ファンタジー',
      socialContext: '封建制',
    },
    timelineRules: '章間は数日以内の経過を基本とする',
    consistencyNotes: '魔法は稀少で代償を伴う',
  };
  generatePlanResult: GeneratedPlan = {
    summary: 'fake summary',
    theme: 'fake theme',
    characters: SAMPLE_PLAN_CHARACTERS.map((c) => ({ ...c })),
    chapters: [{ index: 1, title: 'Chapter 1', outline: 'outline 1' }],
    roughBeats: [
      {
        beatId: 'beat-1',
        label: '起',
        summary: '始まり',
        chapterIndexes: [1],
      },
    ],
  };
  generateChapterTextResult = 'fake chapter text';
  summarizeChapterResult = 'fake chapter summary';
  extractAtomicFactsResult: ExtractedAtomicFacts = {
    facts: [
      {
        subject: 'Hero',
        predicate: 'obtained',
        object: 'sword',
        entityIds: ['char-hero', 'item-sword'],
        validFromChapter: 1,
        validToChapter: null,
        supersedes: [],
      },
    ],
    entities: [
      {
        entityId: 'char-hero',
        name: 'Hero',
        kind: 'character',
        attributes: '主人公',
      },
    ],
    sceneSummary: 'Hero found the sword',
  };

  async generateMetadata(_input: GenerateMetadataInput): Promise<GeneratedMetadata> {
    return this.generateMetadataResult;
  }

  async generatePlan(_input: GeneratePlanInput): Promise<GeneratedPlan> {
    return this.generatePlanResult;
  }

  async generateChapterText(_input: GenerateChapterTextInput): Promise<string> {
    return this.generateChapterTextResult;
  }

  async summarizeChapter(
    _chapterText: string,
    _length: StoryLength,
    _callContext?: LlmCallContext,
  ): Promise<string> {
    return this.summarizeChapterResult;
  }

  async revisePlan(input: RevisePlanInput): Promise<RevisedPlan> {
    return {
      chapters: input.futureChapters.map((chapter) => ({ ...chapter })),
      characters: input.characters.map((c) => ({ ...c })),
    };
  }

  async extractAtomicFacts(input: ExtractAtomicFactsInput): Promise<ExtractedAtomicFacts> {
    return {
      ...this.extractAtomicFactsResult,
      facts: this.extractAtomicFactsResult.facts.map((f) => ({
        ...f,
        validFromChapter: input.chapterIndex,
      })),
      sceneSummary: this.extractAtomicFactsResult.sceneSummary,
    };
  }

  async detectContradictions(
    _input: DetectContradictionsInput,
  ): Promise<ContradictionCheckResult> {
    return { hasContradiction: false, contradictions: [] };
  }

  async expandChapterOutline(input: ExpandChapterOutlineInput): Promise<ExpandedChapterOutline> {
    return {
      title: input.currentOutline.title,
      outline: input.currentOutline.outline,
      discoursePlan: [
        { role: 'theme', purpose: '章の主題を提示する' },
        { role: 'result', purpose: '出来事の結果を描く' },
      ],
      dialogueToNarrationRatio: '会話3:地の文7',
    };
  }

  async realignFuturePlan(input: RealignFuturePlanInput): Promise<RealignedFuturePlan> {
    return {
      roughBeats: input.roughBeats.map((b) => ({
        ...b,
        chapterIndexes: [...b.chapterIndexes],
      })),
      chapters: input.futureChapters.map((chapter) => ({ ...chapter })),
      characters: input.characters.map((c) => ({ ...c })),
    };
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
  readonly sentApprovalEmails: ApprovalRequestedEmailInput[] = [];
  approvalError?: Error;

  async sendCompletionEmail(toEmail: string, storyId: string, downloadUrl: string): Promise<void> {
    this.sentEmails.push({ toEmail, storyId, downloadUrl });
  }

  async sendApprovalRequestedEmail(input: ApprovalRequestedEmailInput): Promise<void> {
    if (this.approvalError) {
      throw this.approvalError;
    }
    this.sentApprovalEmails.push(input);
  }
}

export class FakeRequestQueue implements RequestQueue {
  readonly enqueued: string[] = [];

  async enqueueStoryRequest(storyId: string): Promise<void> {
    this.enqueued.push(storyId);
  }
}

export class FakeWorkflowStarter implements WorkflowStarter {
  readonly started: Array<Record<string, unknown>> = [];
  nextExecutionArn = 'arn:aws:states:us-east-1:123:execution:novel:rev-1';
  /** executionArn → status。未設定時は RUNNING。 */
  executionStatuses = new Map<string, WorkflowExecutionStatus>();
  describeErrors = new Map<string, Error>();

  async startExecution(input: Record<string, unknown>): Promise<{ executionArn: string }> {
    this.started.push(input);
    return { executionArn: this.nextExecutionArn };
  }

  async getExecutionStatus(executionArn: string): Promise<WorkflowExecutionStatus> {
    const error = this.describeErrors.get(executionArn);
    if (error) {
      throw error;
    }
    return this.executionStatuses.get(executionArn) ?? 'RUNNING';
  }
}
