import type { Handler } from 'aws-lambda';
import { container } from '../composition/container';

interface CompensateChapterFailureEvent {
  storyId: string;
  chapterIndex: number;
  reason?: string;
  error?: {
    Error?: string;
    Cause?: string;
  };
}

/** Step Functions: 章生成失敗時の補償トランザクション。 */
export const handler: Handler<CompensateChapterFailureEvent> = async (event) => {
  return container.compensateChapterFailureUseCase().execute({
    storyId: event.storyId,
    chapterIndex: Number(event.chapterIndex),
    reason: event.reason,
    error: event.error,
  });
};
