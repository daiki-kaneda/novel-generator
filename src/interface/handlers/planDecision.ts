import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** POST /stories/{storyId}/plan/decision: プランの承認/拒否（修正フィードバック付き）。 */
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
    const approved = Boolean(body.approved);

    await container.decideApprovalUseCase().execute({
      storyId,
      callerId: caller.ownerId,
      expectedStage: 'plan',
      approved,
      feedback: body.feedback,
    });

    return jsonResponse(200, { storyId, stage: 'plan', approved });
  } catch (error) {
    return errorResponse(error);
  }
};
