import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** POST /stories/{storyId}/revisions: 部分再生成（改訂・実行失敗後の復旧）を開始する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const caller = getAuthenticatedCaller(event);
    const body = JSON.parse(event.body ?? '{}');
    if (body.rewriteFromChapterIndex === undefined) {
      return jsonResponse(400, { message: 'rewriteFromChapterIndex is required' });
    }

    const output = await container.startRevisionUseCase().execute({
      storyId,
      callerId: caller.ownerId,
      rewriteFromChapterIndex: Number(body.rewriteFromChapterIndex),
      feedback: body.feedback ?? '',
    });

    return jsonResponse(202, output);
  } catch (error) {
    return errorResponse(error);
  }
};
