import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { setAuthTokenProvider } from '../api/authToken';
import * as cognito from './cognitoClient';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  email: string;
}

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  resendConfirmationCode: (email: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setAuthTokenProvider(() => cognito.getValidIdToken());

    let cancelled = false;
    cognito
      .restoreCurrentUser()
      .then((restored) => {
        if (cancelled) {
          return;
        }
        setUser(restored);
        setStatus(restored ? 'authenticated' : 'unauthenticated');
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('unauthenticated');
        }
      });

    return () => {
      cancelled = true;
      setAuthTokenProvider(null);
    };
  }, []);

  const signUp = useCallback((email: string, password: string) => cognito.signUp(email, password), []);

  const confirmSignUp = useCallback(
    (email: string, code: string) => cognito.confirmSignUp(email, code),
    [],
  );

  const resendConfirmationCode = useCallback(
    (email: string) => cognito.resendConfirmationCode(email),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    await cognito.signIn(email, password);
    setUser({ email });
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(() => {
    cognito.signOut();
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  return (
    <AuthContext.Provider
      value={{ status, user, signUp, confirmSignUp, resendConfirmationCode, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
