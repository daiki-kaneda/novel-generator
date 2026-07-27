import type { Handler } from 'aws-lambda';
import { container } from '../composition/container';

interface PreparePartialRewriteEvent {
  storyId: string;
  rewriteFromChapterIndex: number;
  feedback?: string;
}

/** Step Functions: 指定章以降の部分再生成準備。 */
export const handler: Handler<PreparePartialRewriteEvent> = async (event) => {
  return container.preparePartialRewriteUseCase().execute({
    storyId: event.storyId,
    rewriteFromChapterIndex: Number(event.rewriteFromChapterIndex),
    feedback: event.feedback,
  });
};
