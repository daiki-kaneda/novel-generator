import { ChapterOutline } from '../../domain/entities/Chapter';
import { PlanProps } from '../../domain/entities/Plan';
import { StoryLength } from '../../domain/value-objects/StoryLength';

export interface GeneratePlanInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  length: StoryLength;
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
  length: StoryLength;
  /** 前章の要約（重要ポイント）。1章目の場合はundefined。本文全体は渡さない。 */
  previousChapterSummary?: string;
  /** 改訂時のみ、この章に対する具体的な修正指示。 */
  revisionInstruction?: string;
}

/**
 * LLM（Bedrock）によるテキスト生成を抽象化するポート。
 * プラン生成・章本文生成・章要約生成をここに集約する。
 */
export interface NovelTextGenerator {
  generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan>;
  generateChapterText(input: GenerateChapterTextInput): Promise<string>;
  /** 次章生成のコンテキストとして渡すための、章本文の重要ポイント要約を生成する。 */
  summarizeChapter(chapterText: string, length: StoryLength): Promise<string>;
}
