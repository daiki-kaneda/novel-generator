import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** POST /stories/{storyId}/final/decision: 最終原稿の承認/拒否（修正フィードバック付き）。 */
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
      expectedStage: 'final',
      approved,
      feedback: body.feedback,
      rewriteFromChapterIndex:
        body.rewriteFromChapterIndex !== undefined
          ? Number(body.rewriteFromChapterIndex)
          : undefined,
    });

    return jsonResponse(200, {
      storyId,
      stage: 'final',
      approved,
      rewriteFromChapterIndex: body.rewriteFromChapterIndex,
    });
  } catch (error) {
    return errorResponse(error);
  }
};
