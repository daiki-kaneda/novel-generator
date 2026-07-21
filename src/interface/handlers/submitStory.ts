import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { container } from '../composition/container';
import { jsonResponse, errorResponse } from './support/httpResponse';

/** POST /stories: ユーザーが物語の概要・テーマ・登場人物を送信する。 */
export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  try {
    const input = JSON.parse(event.body ?? '{}');
    const output = await container.submitStoryUseCase().execute(input);
    return jsonResponse(201, output);
  } catch (error) {
    return errorResponse(error);
  }
};
