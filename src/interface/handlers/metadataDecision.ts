import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** POST /stories/{storyId}/metadata/decision: メタデータ（設定書）の承認/拒否（修正フィードバック付き）。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const storyId = event.pathParameters?.storyId;
    if (!storyId) {
      return jsonResponse(400, { message: 'storyId path parameter is required' });
    }
    const body = JSON.parse(event.body ?? '{}');
    const approved = Boolean(body.approved);

    await container.decideApprovalUseCase().execute({
      storyId,
      expectedStage: 'metadata',
      approved,
      feedback: body.feedback,
    });

    return jsonResponse(200, { storyId, stage: 'metadata', approved });
  } catch (error) {
    return errorResponse(error);
  }
};
