import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** POST /stories/{storyId}/revisions: 完成済み物語の部分改訂ワークフローを開始する。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const body = JSON.parse(event.body ?? '{}');
    if (body.rewriteFromChapterIndex === undefined) {
      return jsonResponse(400, { message: 'rewriteFromChapterIndex is required' });
    }

    const output = await container.startRevisionUseCase().execute({
      storyId,
      rewriteFromChapterIndex: Number(body.rewriteFromChapterIndex),
      feedback: body.feedback ?? '',
    });

    return jsonResponse(202, output);
  } catch (error) {
    return errorResponse(error);
  }
};
