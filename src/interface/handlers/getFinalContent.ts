import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** GET /stories/{storyId}/final/content: 完成原稿の署名付きURLを再発行する。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const output = await container.getFinalContentUseCase().execute({ storyId });
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
