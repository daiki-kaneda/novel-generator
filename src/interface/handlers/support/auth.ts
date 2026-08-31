import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import { ValidationError } from '../../../domain/errors/DomainErrors';

export interface AuthenticatedCaller {
  /** Cognito `sub`。所有者の一意な識別子として使う。 */
  ownerId: string;
  /** Cognito `email`クレーム。完成通知の送付先として使う。 */
  email: string;
}

/**
 * HTTP API の JWT オーソライザ（Cognito User Pool）が検証済みのクレームを取り出す。
 * 全ルートにオーソライザが付いているため、ここに到達した時点で認証は済んでいるはずだが、
 * クレームの欠落は防御的に検出する。
 */
export function getAuthenticatedCaller(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): AuthenticatedCaller {
  const claims = event.requestContext.authorizer?.jwt?.claims ?? {};
  const sub = claims.sub;
  const email = claims.email;
  if (typeof sub !== 'string' || !sub) {
    throw new ValidationError('Authenticated request is missing a subject (sub) claim');
  }
  if (typeof email !== 'string' || !email) {
    throw new ValidationError('Authenticated request is missing an email claim');
  }
  return { ownerId: sub, email };
}
