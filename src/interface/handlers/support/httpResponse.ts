import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  BudgetExceededError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../../domain/errors/DomainErrors';

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
  if (error instanceof ForbiddenError) {
    return jsonResponse(403, { message: error.message });
  }
  if (error instanceof BudgetExceededError) {
    return jsonResponse(402, {
      message: error.message,
      planTier: error.planTier,
      monthlyCostUsd: error.monthlyCostUsd,
      monthlyBudgetUsd: error.monthlyBudgetUsd,
    });
  }
  console.error(error);
  return jsonResponse(500, { message: 'Internal server error' });
}
