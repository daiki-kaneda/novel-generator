import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { getRuntimeConfig } from '../api/runtimeConfig';

let cachedPool: CognitoUserPool | undefined;

/**
 * `RuntimeConfig`読み込み後にのみ呼べる。Hosted UI/OAuthは使わず、
 * このプールを通じてブラウザから直接サインアップ/サインイン（SRP認証）する。
 */
export function getUserPool(): CognitoUserPool {
  if (!cachedPool) {
    const { cognitoUserPoolId, cognitoUserPoolClientId } = getRuntimeConfig();
    cachedPool = new CognitoUserPool({
      UserPoolId: cognitoUserPoolId,
      ClientId: cognitoUserPoolClientId,
    });
  }
  return cachedPool;
}

function promisify<T>(
  fn: (callback: (err: Error | undefined, result: T | undefined) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result as T);
    });
  });
}

export function signUp(email: string, password: string): Promise<void> {
  const pool = getUserPool();
  return new Promise((resolve, reject) => {
    pool.signUp(
      email,
      password,
      [new CognitoUserAttribute({ Name: 'email', Value: email })],
      [],
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: getUserPool() });
  return promisify((callback) => user.confirmRegistration(code, true, callback));
}

export function resendConfirmationCode(email: string): Promise<void> {
  const user = new CognitoUser({ Username: email, Pool: getUserPool() });
  return promisify((callback) => user.resendConfirmationCode(callback));
}

export function signIn(email: string, password: string): Promise<CognitoUserSession> {
  const user = new CognitoUser({ Username: email, Pool: getUserPool() });
  return new Promise((resolve, reject) => {
    user.authenticateUser(new AuthenticationDetails({ Username: email, Password: password }), {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

export function signOut(): void {
  getUserPool().getCurrentUser()?.signOut();
}

/**
 * ログイン中であれば、必要に応じてリフレッシュトークンで裏側で更新した上で
 * 有効なIDトークンを返す。未ログインなら`null`。
 */
export function getValidIdToken(): Promise<string | null> {
  const currentUser = getUserPool().getCurrentUser();
  if (!currentUser) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      resolve(session.getIdToken().getJwtToken());
    });
  });
}

export interface CurrentAuthUser {
  email: string;
}

/** 起動時に、既存セッション（ローカルストレージのリフレッシュトークン）から復元を試みる。 */
export function restoreCurrentUser(): Promise<CurrentAuthUser | null> {
  const currentUser = getUserPool().getCurrentUser();
  if (!currentUser) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session || !session.isValid()) {
        resolve(null);
        return;
      }
      const email = session.getIdToken().payload.email as string | undefined;
      resolve(email ? { email } : null);
    });
  });
}
