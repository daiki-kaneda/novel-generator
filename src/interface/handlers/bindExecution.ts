import { container } from '../composition/container';

export interface BindExecutionEvent {
  storyId: string;
  executionArn: string;
}

/** Step Functions 先頭: 実行 ARN を Story に記録して実行中ロックを取る。 */
export const handler = async (event: BindExecutionEvent): Promise<{ storyId: string; executionArn: string }> => {
  return container.bindExecutionUseCase().execute({
    storyId: event.storyId,
    executionArn: event.executionArn,
  });
};
