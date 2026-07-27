import { ChapterOutline } from '../../domain/entities/Chapter';
import { PlanProps, RoughBeat } from '../../domain/entities/Plan';
import {
  CharacterProfile,
  StoryMetadataProps,
  WorldSetting,
} from '../../domain/entities/StoryMetadata';
import { AtomicFact, WorldEntity } from '../../domain/entities/WorldState';
import { StoryLength } from '../../domain/value-objects/StoryLength';

/** LLM 呼び出しの構造化ログ・追跡用に付与する相関コンテキスト。 */
export interface LlmCallContext {
  storyId: string;
  chapterIndex?: number;
}

export interface GenerateMetadataInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  setting?: string;
  length: StoryLength;
  previousMetadata?: StoryMetadataProps;
  feedback?: string;
  callContext?: LlmCallContext;
}

export interface GeneratedMetadata {
  overview: string;
  theme: string;
  tone: string;
  characters: CharacterProfile[];
  world: WorldSetting;
  timelineRules: string;
  consistencyNotes: string;
}

export interface GeneratePlanInput {
  metadata: Omit<StoryMetadataProps, 'revisionHistory'>;
  length: StoryLength;
  /** プラン拒否による再生成の場合、直前のプランと今回のフィードバックを渡す。 */
  previousPlan?: PlanProps;
  feedback?: string;
  callContext?: LlmCallContext;
}

export interface GeneratedPlan {
  summary: string;
  theme: string;
  characters: CharacterProfile[];
  chapters: ChapterOutline[];
  roughBeats?: RoughBeat[];
}

/** 章生成時の設定書。登場人物は Plan 側が正本のため含めない。 */
export type ChapterGenerationMetadata = Omit<
  StoryMetadataProps,
  'revisionHistory' | 'characters'
>;

export interface GenerateChapterTextInput {
  metadata: ChapterGenerationMetadata;
  plan: {
    summary: string;
    /** 執筆時の登場人物の正本（動的に更新される）。 */
    characters: CharacterProfile[];
    /**
     * 当該章までの詳細アウトライン。
     * 未来章の詳細は含めず、粗い骨格は roughBeats / futureRoughOutlines で渡す。
     */
    chapters: ChapterOutline[];
    roughBeats?: RoughBeat[];
    /** 未執筆章の粗いメモ（title + 短い outline）。 */
    futureRoughOutlines?: ChapterOutline[];
  };
  chapterOutline: ChapterOutline;
  length: StoryLength;
  /** TKG から取得した、現在有効な事実。 */
  activeFacts?: Array<{
    factId: string;
    subject: string;
    predicate: string;
    object: string;
  }>;
  /** 直前章の短い場面要約（本文全体は渡さない）。 */
  previousSceneSummary?: string;
  /** @deprecated previousSceneSummary を使用。後方互換のため残す。 */
  previousChapterSummary?: string;
  discoursePlan?: Array<{ role: string; purpose: string }>;
  dialogueToNarrationRatio?: string;
  forbiddenDevelopments?: string[];
  /** 改訂時のみ、この章に対する具体的な修正指示。 */
  revisionInstruction?: string;
  callContext?: LlmCallContext;
}

/** 章完成後に未来章アウトラインと登場人物を自然になるよう改訂するための入力。 */
export interface RevisePlanInput {
  metadata: ChapterGenerationMetadata;
  /** 変更禁止のアンカー。 */
  planSummary: string;
  planTheme: string;
  /** 現在の Plan 登場人物（改訂対象）。 */
  characters: CharacterProfile[];
  completedChapter: ChapterOutline & { summaryKeyPoints: string };
  /** 改訂対象となる、完了章より後の章アウトライン。 */
  futureChapters: ChapterOutline[];
  length: StoryLength;
  forbiddenDevelopments?: string[];
  callContext?: LlmCallContext;
}

export interface RevisedPlan {
  chapters: ChapterOutline[];
  characters: CharacterProfile[];
}

export interface ExtractAtomicFactsInput {
  chapterText: string;
  chapterIndex: number;
  knownEntities?: WorldEntity[];
  callContext?: LlmCallContext;
}

export interface ExtractedAtomicFacts {
  facts: Array<{
    subject: string;
    predicate: string;
    object: string;
    entityIds: string[];
    validFromChapter: number;
    validToChapter?: number | null;
    supersedes?: string[];
  }>;
  entities: Array<{
    entityId: string;
    name: string;
    kind: 'character' | 'place' | 'item' | 'other';
    attributes: string;
  }>;
  sceneSummary: string;
}

export interface DetectContradictionsInput {
  activeFacts: AtomicFact[];
  newFacts: Array<{
    subject: string;
    predicate: string;
    object: string;
  }>;
  callContext?: LlmCallContext;
}

export interface ContradictionCheckResult {
  hasContradiction: boolean;
  contradictions: Array<{
    newFact: string;
    conflictingFact: string;
    reason: string;
  }>;
}

export interface ExpandChapterOutlineInput {
  chapterIndex: number;
  roughBeat: RoughBeat;
  currentOutline: ChapterOutline;
  activeFacts: Array<{
    factId: string;
    subject: string;
    predicate: string;
    object: string;
  }>;
  characters: CharacterProfile[];
  forbiddenDevelopments?: string[];
  length: StoryLength;
  callContext?: LlmCallContext;
}

export interface ExpandedChapterOutline {
  title: string;
  outline: string;
  discoursePlan: Array<{
    role: 'theme' | 'elaboration' | 'contrast' | 'result' | 'dialogue' | 'description';
    purpose: string;
  }>;
  dialogueToNarrationRatio: string;
}

export interface RealignFuturePlanInput {
  metadata: ChapterGenerationMetadata;
  planSummary: string;
  planTheme: string;
  roughBeats: RoughBeat[];
  characters: CharacterProfile[];
  completedChapter: ChapterOutline & { summaryKeyPoints: string };
  futureChapters: ChapterOutline[];
  activeFacts: Array<{
    factId: string;
    subject: string;
    predicate: string;
    object: string;
  }>;
  forbiddenDevelopments?: string[];
  length: StoryLength;
  callContext?: LlmCallContext;
}

export interface RealignedFuturePlan {
  roughBeats: RoughBeat[];
  chapters: ChapterOutline[];
  characters: CharacterProfile[];
}

/**
 * LLM（Bedrock）によるテキスト生成を抽象化するポート。
 * メタデータ生成・プラン生成・章本文生成・事実抽出・プラン改訂をここに集約する。
 */
export interface NovelTextGenerator {
  generateMetadata(input: GenerateMetadataInput): Promise<GeneratedMetadata>;
  generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan>;
  generateChapterText(input: GenerateChapterTextInput): Promise<string>;
  /** 次章接続用の章要約（後方互換。Phase 2 以降は extractAtomicFacts を主経路とする）。 */
  summarizeChapter(
    chapterText: string,
    length: StoryLength,
    callContext?: LlmCallContext,
  ): Promise<string>;
  /**
   * 完了した章の要約を踏まえ、未来章の title/outline と登場人物プロフィールを改訂する。
   * chapters の index 集合は入力の futureChapters と完全一致しなければならない。
   */
  revisePlan(input: RevisePlanInput): Promise<RevisedPlan>;
  extractAtomicFacts(input: ExtractAtomicFactsInput): Promise<ExtractedAtomicFacts>;
  detectContradictions(input: DetectContradictionsInput): Promise<ContradictionCheckResult>;
  expandChapterOutline(input: ExpandChapterOutlineInput): Promise<ExpandedChapterOutline>;
  realignFuturePlan(input: RealignFuturePlanInput): Promise<RealignedFuturePlan>;
}
