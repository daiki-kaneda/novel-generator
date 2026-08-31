import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** GET /stories/{storyId}/chapters/{chapterIndex}/content: 章本文と署名付きURLを取得する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    const chapterIndexRaw = event.pathParameters?.chapterIndex;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    if (!chapterIndexRaw) {
      return jsonResponse(400, { message: 'chapterIndex path parameter is required' });
    }
    const chapterIndex = Number(chapterIndexRaw);
    if (!Number.isInteger(chapterIndex) || chapterIndex < 1) {
      return jsonResponse(400, { message: 'chapterIndex must be a positive integer' });
    }

    const caller = getAuthenticatedCaller(event);
    const output = await container
      .getChapterContentUseCase()
      .execute({ storyId, chapterIndex, callerId: caller.ownerId });
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
