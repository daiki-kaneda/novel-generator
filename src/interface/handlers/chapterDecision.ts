import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** POST /stories/{storyId}/chapters/{chapterIndex}/decision: 章の承認/拒否（修正フィードバック付き）。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
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

    const body = JSON.parse(event.body ?? '{}');
    const approved = Boolean(body.approved);

    await container.decideApprovalUseCase().execute({
      storyId,
      expectedStage: 'chapter',
      approved,
      feedback: body.feedback,
      chapterIndex,
    });

    return jsonResponse(200, { storyId, stage: 'chapter', chapterIndex, approved });
  } catch (error) {
    return errorResponse(error);
  }
};
