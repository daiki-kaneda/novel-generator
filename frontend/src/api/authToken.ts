/**
 * `AuthContext`が起動時に登録する、APIリクエストへ添付する認証トークンの取得手段。
 * `client.ts`がAuthContext（Reactツリー）に直接依存しないよう、この薄い間接層越しに繋ぐ。
 */
type TokenProvider = () => Promise<string | null>;

let tokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function getAuthToken(): Promise<string | null> {
  if (!tokenProvider) {
    return null;
  }
  return tokenProvider();
}
