/** 物語の長さプリセット。投稿時に指定し、Plan生成・章生成の目安に使う。 */
export type StoryLength = 'short' | 'medium';

export interface StoryLengthPreset {
  /** Plan生成プロンプトに渡す章数の目安。 */
  chapterCountHint: string;
  /** 章本文生成プロンプトに渡す1章あたりの目標文字数。 */
  targetCharsPerChapter: string;
  /** 章本文生成時の max_tokens。 */
  chapterMaxTokens: number;
  /** 章要約生成時の max_tokens。 */
  summaryMaxTokens: number;
}

export const STORY_LENGTH_PRESETS: Record<StoryLength, StoryLengthPreset> = {
  short: {
    chapterCountHint: '3〜8章程度',
    targetCharsPerChapter: '1500〜3000字',
    chapterMaxTokens: 8192,
    summaryMaxTokens: 4096,
  },
  medium: {
    chapterCountHint: '4〜10章程度',
    targetCharsPerChapter: '4000〜8000字',
    chapterMaxTokens: 16384,
    summaryMaxTokens: 6144,
  },
};

export function resolveStoryLength(value: unknown): StoryLength {
  return value === 'medium' ? 'medium' : 'short';
}
