/**
 * 章本文生成の失敗を、ユーザーと LLM（禁止展開）の両方に渡せる形に正規化する。
 * Step Functions の Catch が載せる Lambda エラー JSON を直接表示しない。
 */

export type ChapterErrorKind = 'contradiction' | 'timeout' | 'throttled' | 'unknown';

export interface ContradictionDetail {
  newFact: string;
  conflictingFact: string;
  reason: string;
}

export interface ChapterGenerationError {
  chapterIndex: number;
  kind: ChapterErrorKind;
  /** ユーザー向けの説明。スタックトレースや Lambda JSON は含めない。 */
  message: string;
  contradictions?: ContradictionDetail[];
}

export interface StepFunctionsErrorPayload {
  Error?: string;
  Cause?: string;
}

/** ContradictionDetectedError.message に矛盾リストを埋め込む区切り。 */
export const CONTRADICTIONS_FOOTER_MARKER = '\n---CONTRADICTIONS---\n';

export function formatContradictionUserMessage(
  chapterIndex: number,
  contradictions: ContradictionDetail[],
): string {
  if (contradictions.length === 0) {
    return `第${chapterIndex}章の生成で、これまでの設定と矛盾する内容が見つかりました。矛盾の詳細は取得できませんでした。展開を変える指示を出して再生成してください。`;
  }
  return `第${chapterIndex}章の生成で、これまでの設定と矛盾する内容が見つかりました。矛盾しない展開になるよう、修正の指示を出して再生成してください。`;
}

export function formatContradictionForbiddenDevelopment(
  chapterIndex: number,
  contradictions: ContradictionDetail[],
): string {
  const lines = [
    `第${chapterIndex}章の生成で、これまでの設定と矛盾する内容が見つかりました。`,
  ];
  if (contradictions.length === 0) {
    lines.push('矛盾の詳細は取得できませんでした。');
    return lines.join('\n');
  }
  for (const item of contradictions) {
    lines.push(
      `・新しい事実「${item.newFact}」は、既存の事実「${item.conflictingFact}」と矛盾します（${item.reason}）`,
    );
  }
  return lines.join('\n');
}

/** Lambda / Step Functions の errorMessage として載せる本文（ユーザー向け + 機械可読フッタ）。 */
export function serializeContradictionError(
  chapterIndex: number,
  contradictions: ContradictionDetail[],
): string {
  return (
    formatContradictionUserMessage(chapterIndex, contradictions) +
    CONTRADICTIONS_FOOTER_MARKER +
    JSON.stringify(contradictions)
  );
}

export function parseContradictionErrorMessage(errorMessage: string): {
  message: string;
  contradictions: ContradictionDetail[];
} {
  const markerIndex = errorMessage.indexOf(CONTRADICTIONS_FOOTER_MARKER);
  if (markerIndex < 0) {
    return { message: errorMessage.trim(), contradictions: [] };
  }
  const message = errorMessage.slice(0, markerIndex).trim();
  try {
    const parsed: unknown = JSON.parse(
      errorMessage.slice(markerIndex + CONTRADICTIONS_FOOTER_MARKER.length),
    );
    if (!Array.isArray(parsed)) {
      return { message, contradictions: [] };
    }
    const contradictions = parsed.filter(isContradictionDetail);
    return { message, contradictions };
  } catch {
    return { message, contradictions: [] };
  }
}

function isContradictionDetail(value: unknown): value is ContradictionDetail {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.newFact === 'string' &&
    typeof record.conflictingFact === 'string' &&
    typeof record.reason === 'string'
  );
}

function classifyErrorName(errorName: string): ChapterErrorKind {
  const name = errorName.toLowerCase();
  if (name.includes('contradiction')) {
    return 'contradiction';
  }
  if (name.includes('timeout')) {
    return 'timeout';
  }
  if (name.includes('throttl') || name.includes('toomanyrequests')) {
    return 'throttled';
  }
  return 'unknown';
}

function fallbackMessage(kind: ChapterErrorKind, chapterIndex: number): string {
  switch (kind) {
    case 'contradiction':
      return `第${chapterIndex}章の生成で、これまでの設定と矛盾する内容が見つかりました。展開を変える指示を出して再生成してください。`;
    case 'timeout':
      return `第${chapterIndex}章の生成が時間切れになりました。指示を出して再生成してください。`;
    case 'throttled':
      return `生成サービスが混み合っているため、第${chapterIndex}章の生成に失敗しました。少し待ってから再生成してください。`;
    default:
      return `第${chapterIndex}章の本文生成に失敗しました。展開を変える指示を出して再生成してください。`;
  }
}

/**
 * 生の英語メッセージや Lambda JSON をユーザー向け本文として使わない。
 * 日本語の説明文、または ContradictionDetectedError のシリアライズ済み本文だけを採用する。
 */
function isUserFacingMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return false;
  }
  if (/"error(Type|Message)"/.test(trimmed) || trimmed.includes('\n    at ')) {
    return false;
  }
  return /[ぁ-んァ-ン一-龥]/.test(trimmed);
}

function extractLambdaCause(cause: string): { errorType?: string; errorMessage?: string } {
  try {
    const parsed: unknown = JSON.parse(cause);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const record = parsed as Record<string, unknown>;
    return {
      errorType: typeof record.errorType === 'string' ? record.errorType : undefined,
      errorMessage: typeof record.errorMessage === 'string' ? record.errorMessage : undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Step Functions Catch の `Error` / `Cause` から、ユーザー向けの章生成エラーを組み立てる。
 * Cause が Lambda のスタック JSON でも、それをそのまま返さない。
 */
export function parseChapterGenerationError(
  chapterIndex: number,
  error?: StepFunctionsErrorPayload,
  fallbackReason?: string,
): ChapterGenerationError {
  const errorName = error?.Error ?? '';
  const cause = error?.Cause ?? '';
  const extracted = cause ? extractLambdaCause(cause) : {};
  const kind = classifyErrorName(extracted.errorType ?? errorName);

  if (kind === 'contradiction') {
    const raw = extracted.errorMessage ?? (isUserFacingMessage(cause) ? cause : '');
    if (raw) {
      const parsed = parseContradictionErrorMessage(raw);
      return {
        chapterIndex,
        kind,
        message: parsed.message || fallbackMessage(kind, chapterIndex),
        contradictions: parsed.contradictions.length > 0 ? parsed.contradictions : undefined,
      };
    }
    return { chapterIndex, kind, message: fallbackMessage(kind, chapterIndex) };
  }

  const candidate = extracted.errorMessage ?? fallbackReason ?? cause;
  const message = isUserFacingMessage(candidate)
    ? parseContradictionErrorMessage(candidate).message
    : fallbackMessage(kind, chapterIndex);

  return { chapterIndex, kind, message };
}
