import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { NotFoundError, ValidationError } from '../../../domain/errors/DomainErrors';

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

/** ドメイン/アプリケーション層の例外をHTTPステータスコードにマッピングする。 */
export function errorResponse(error: unknown): APIGatewayProxyResultV2 {
  if (error instanceof ValidationError) {
    return jsonResponse(400, { message: error.message });
  }
  if (error instanceof NotFoundError) {
    return jsonResponse(404, { message: error.message });
  }
  console.error(error);
  return jsonResponse(500, { message: 'Internal server error' });
}
