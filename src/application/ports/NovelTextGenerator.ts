import { ChapterOutline } from '../../domain/entities/Chapter';
import { PlanProps } from '../../domain/entities/Plan';
import {
  CharacterProfile,
  StoryMetadataProps,
  WorldSetting,
} from '../../domain/entities/StoryMetadata';
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
     * 当該章までの章アウトラインのみ（未来章はマスク済み）。
     * 呼び出し側で index <= 生成対象章 にフィルタして渡すこと。
     */
    chapters: ChapterOutline[];
  };
  chapterOutline: ChapterOutline;
  length: StoryLength;
  /** 前章の要約（重要ポイント）。1章目の場合はundefined。本文全体は渡さない。 */
  previousChapterSummary?: string;
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
  callContext?: LlmCallContext;
}

export interface RevisedPlan {
  chapters: ChapterOutline[];
  characters: CharacterProfile[];
}

/**
 * LLM（Bedrock）によるテキスト生成を抽象化するポート。
 * メタデータ生成・プラン生成・章本文生成・章要約生成・プラン改訂をここに集約する。
 */
export interface NovelTextGenerator {
  generateMetadata(input: GenerateMetadataInput): Promise<GeneratedMetadata>;
  generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan>;
  generateChapterText(input: GenerateChapterTextInput): Promise<string>;
  /** 次章生成のコンテキストとして渡すための、章本文の重要ポイント要約を生成する。 */
  summarizeChapter(
    chapterText: string,
    length: StoryLength,
    callContext?: LlmCallContext,
  ): Promise<string>;
  /**
   * 完了した章の要約を踏まえ、未来章の title/outline と登場人物プロフィールを改訂する。
   * chapters の index 集合は入力の futureChapters と完全一致しなければならない。
   * characters は1人以上。新規人物の追加や心境・関係性の更新を含む。
   */
  revisePlan(input: RevisePlanInput): Promise<RevisedPlan>;
}
