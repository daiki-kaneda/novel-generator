import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';
import { getAuthenticatedCaller } from './support/auth';

/** POST /stories: ユーザーが物語の概要・テーマ・登場人物を送信する。 */
export const handler = async (
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const caller = getAuthenticatedCaller(event);
    const input = JSON.parse(event.body ?? '{}');
    const output = await container.submitStoryUseCase().execute({
      ...input,
      ownerId: caller.ownerId,
      // メールアドレスはクライアント入力を信用せず、JWTのemailクレームを正とする。
      userEmail: caller.email,
    });
    return jsonResponse(201, output);
  } catch (error) {
    return errorResponse(error);
  }
};
