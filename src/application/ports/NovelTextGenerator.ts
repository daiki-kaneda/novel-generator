import { ChapterOutline } from '../../domain/entities/Chapter';
import { PlanProps } from '../../domain/entities/Plan';
import { ChapterRevisionInstruction } from '../../domain/services/RevisionScopePolicy';

export interface GeneratePlanInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  /** プラン拒否による再生成の場合、直前のプランと今回のフィードバックを渡す。 */
  previousPlan?: PlanProps;
  feedback?: string;
}

export interface GeneratedPlan {
  summary: string;
  theme: string;
  characters: string;
  chapters: ChapterOutline[];
}

export interface GenerateChapterTextInput {
  planSummary: string;
  theme: string;
  characters: string;
  chapterOutline: ChapterOutline;
  /** 前章の要約（重要ポイント）。1章目の場合はundefined。本文全体は渡さない。 */
  previousChapterSummary?: string;
  /** 改訂時のみ、この章に対する具体的な修正指示。 */
  revisionInstruction?: string;
}

export interface ProposeRevisionPlanInput {
  feedback: string;
  chapters: Array<{
    index: number;
    title: string;
    outline: string;
    summaryKeyPoints?: string;
  }>;
}

/**
 * LLM（Bedrock）によるテキスト生成を抽象化するポート。
 * プラン生成・章本文生成・章要約生成・改訂プラン提案のすべてをここに集約する。
 */
export interface NovelTextGenerator {
  generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan>;
  generateChapterText(input: GenerateChapterTextInput): Promise<string>;
  /** 次章生成のコンテキストとして渡すための、章本文の重要ポイント要約を生成する。 */
  summarizeChapter(chapterText: string): Promise<string>;
  /** 拒否フィードバックから、改訂すべき章と指示内容の提案を生成する。 */
  proposeRevisionPlan(input: ProposeRevisionPlanInput): Promise<ChapterRevisionInstruction[]>;
}
