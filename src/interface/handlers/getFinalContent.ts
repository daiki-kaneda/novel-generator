import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** GET /stories/{storyId}/final/content: 完成原稿の署名付きURLを再発行する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const caller = getAuthenticatedCaller(event);
    const output = await container
      .getFinalContentUseCase()
      .execute({ storyId, callerId: caller.ownerId });
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
