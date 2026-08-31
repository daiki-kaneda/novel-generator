import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** GET /stories/{storyId}: 物語の現在の進行状況を取得する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const caller = getAuthenticatedCaller(event);
    const output = await container.getStoryStatusUseCase().execute(storyId, caller.ownerId);
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
