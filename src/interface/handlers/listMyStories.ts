import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** GET /me/stories: 認証済みユーザー自身が送信した物語の一覧を取得する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const caller = getAuthenticatedCaller(event);
    const output = await container.listMyStoriesUseCase().execute(caller.ownerId);
    return jsonResponse(200, output);
  } catch (error) {
    return errorResponse(error);
  }
};
