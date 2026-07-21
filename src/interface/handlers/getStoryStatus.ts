import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** GET /stories/{storyId}: 物語の現在の進行状況を取得する。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const output = await container.getStoryStatusUseCase().execute(storyId);
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
