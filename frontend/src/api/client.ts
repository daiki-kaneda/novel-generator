import { getRuntimeConfig } from './runtimeConfig';
import type {
  ChapterContentOutput,
  FinalContentOutput,
  DecisionInput,
  FinalDecisionInput,
  StartRevisionInput,
  StartRevisionOutput,
  StoryStatusOutput,
  SubmitStoryInput,
  SubmitStoryOutput,
} from './types';

/** バックエンドが返すエラーレスポンス（`httpResponse.ts` の `errorResponse`）に対応する例外。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiBaseUrl } = getRuntimeConfig();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });

  const text = await response.text();
  const body: unknown = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body && typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `リクエストに失敗しました (status: ${response.status})`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}

/** POST /stories */
export function submitStory(input: SubmitStoryInput): Promise<SubmitStoryOutput> {
  return request('/stories', { method: 'POST', body: JSON.stringify(input) });
}

/** GET /stories/{storyId} */
export function getStoryStatus(storyId: string): Promise<StoryStatusOutput> {
  return request(`/stories/${encodeURIComponent(storyId)}`);
}

/** GET /stories/{storyId}/chapters/{chapterIndex}/content */
export function getChapterContent(storyId: string, chapterIndex: number): Promise<ChapterContentOutput> {
  return request(`/stories/${encodeURIComponent(storyId)}/chapters/${chapterIndex}/content`);
}

/** GET /stories/{storyId}/final/content */
export function getFinalContent(storyId: string): Promise<FinalContentOutput> {
  return request(`/stories/${encodeURIComponent(storyId)}/final/content`);
}

/** POST /stories/{storyId}/metadata/decision */
export function decideMetadataApproval(
  storyId: string,
  input: DecisionInput,
): Promise<{ storyId: string; stage: 'metadata'; approved: boolean }> {
  return request(`/stories/${encodeURIComponent(storyId)}/metadata/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /stories/{storyId}/plan/decision */
export function decidePlanApproval(
  storyId: string,
  input: DecisionInput,
): Promise<{ storyId: string; stage: 'plan'; approved: boolean }> {
  return request(`/stories/${encodeURIComponent(storyId)}/plan/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /stories/{storyId}/chapters/{chapterIndex}/decision */
export function decideChapterApproval(
  storyId: string,
  chapterIndex: number,
  input: DecisionInput,
): Promise<{ storyId: string; stage: 'chapter'; chapterIndex: number; approved: boolean }> {
  return request(`/stories/${encodeURIComponent(storyId)}/chapters/${chapterIndex}/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /stories/{storyId}/final/decision */
export function decideFinalApproval(
  storyId: string,
  input: FinalDecisionInput,
): Promise<{ storyId: string; stage: 'final'; approved: boolean }> {
  return request(`/stories/${encodeURIComponent(storyId)}/final/decision`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

/** POST /stories/{storyId}/revisions */
export function startRevision(storyId: string, input: StartRevisionInput): Promise<StartRevisionOutput> {
  return request(`/stories/${encodeURIComponent(storyId)}/revisions`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
