'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import type { AuthUser, LoginInput, RegisterInput } from '@findbd/shared';
import {
  apiGet,
  apiPost,
  restoreSession,
  setAccessToken,
  setSessionLostHandler,
} from './api';

/**
 * Session state for the whole client.
 *
 * On mount it does one thing: ask the server to trade the httpOnly refresh cookie
 * for an access token. That is the only way to know whether the visitor is signed
 * in, because nothing about the session is readable from JavaScript by design.
 * `ready` is false until that round-trip settles, and guarded pages wait for it —
 * without that flag, every protected page would flash its sign-in redirect on
 * first paint for a user who is perfectly well signed in.
 */

interface AuthContextValue {
  user: AuthUser | null;
  /** False until the initial session restore has settled. */
  ready: boolean;
  signIn: (input: LoginInput) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setSessionLostHandler(() => setUser(null));

    (async () => {
      const token = await restoreSession();
      if (cancelled) return;

      if (!token) {
        setReady(true);
        return;
      }
      try {
        const { user: me } = await apiGet<{ user: AuthUser }>('/api/auth/me');
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      setSessionLostHandler(null);
    };
  }, []);

  const signIn = useCallback(async (input: LoginInput) => {
    const res = await apiPost<AuthResponse>('/api/auth/login', input);
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const signUp = useCallback(async (input: RegisterInput) => {
    const res = await apiPost<AuthResponse>('/api/auth/register', input);
    setAccessToken(res.accessToken);
    setUser(res.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout');
    } finally {
      // Local state clears either way. A failed logout call must not leave the
      // user looking signed in on a client that can no longer prove it.
      setAccessToken(null);
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut }),
    [user, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/**
 * Guard a page. Returns the user once known, `null` while still deciding.
 *
 * The redirect carries a `next` parameter so signing in returns you to the page
 * you were trying to reach — losing that is a small thing that feels like a bug
 * every single time.
 */
export function useRequireAuth(): AuthUser | null {
  const { user, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!ready || user) return;
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [ready, user, router]);

  return user;
}
