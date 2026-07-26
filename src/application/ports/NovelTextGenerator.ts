import { ChapterOutline } from '../../domain/entities/Chapter';
import { PlanProps } from '../../domain/entities/Plan';
import {
  CharacterProfile,
  StoryMetadataProps,
  WorldSetting,
} from '../../domain/entities/StoryMetadata';
import { StoryLength } from '../../domain/value-objects/StoryLength';

export interface GenerateMetadataInput {
  overview: string;
  theme: string;
  characters: string;
  tone?: string;
  setting?: string;
  length: StoryLength;
  previousMetadata?: StoryMetadataProps;
  feedback?: string;
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
}

export interface GeneratedPlan {
  summary: string;
  theme: string;
  characters: string;
  chapters: ChapterOutline[];
}

export interface GenerateChapterTextInput {
  metadata: Omit<StoryMetadataProps, 'revisionHistory'>;
  plan: {
    summary: string;
    chapters: ChapterOutline[];
  };
  chapterOutline: ChapterOutline;
  length: StoryLength;
  /** 前章の要約（重要ポイント）。1章目の場合はundefined。本文全体は渡さない。 */
  previousChapterSummary?: string;
  /** 改訂時のみ、この章に対する具体的な修正指示。 */
  revisionInstruction?: string;
}

/**
 * LLM（Bedrock）によるテキスト生成を抽象化するポート。
 * メタデータ生成・プラン生成・章本文生成・章要約生成をここに集約する。
 */
export interface NovelTextGenerator {
  generateMetadata(input: GenerateMetadataInput): Promise<GeneratedMetadata>;
  generatePlan(input: GeneratePlanInput): Promise<GeneratedPlan>;
  generateChapterText(input: GenerateChapterTextInput): Promise<string>;
  /** 次章生成のコンテキストとして渡すための、章本文の重要ポイント要約を生成する。 */
  summarizeChapter(chapterText: string, length: StoryLength): Promise<string>;
}
