// Note about signIn() and signOut() methods:
//
// On signIn() and signOut() we pass 'json: true' to request a response in JSON
// instead of HTTP as redirect URLs on other domains are not returned to
// requests made using the fetch API in the browser, and we need to ask the API
// to return the response as a JSON object (the end point still defaults to
// returning an HTTP response with a redirect for non-JavaScript clients).
//
// We use HTTP POST requests with CSRF Tokens to protect against CSRF attacks.

import { useSystemOnline } from '@toeverything/hooks/use-system-online';
import { useAtomValue, useSetAtom } from 'jotai/react';
import { atom } from 'jotai/vanilla';
import type { DefaultSession, Session } from 'next-auth';
import type { AuthClientConfig, CtxOrReq } from 'next-auth/client/_utils';
import {
  apiBaseUrl,
  BroadcastChannel,
  fetchData,
  now,
} from 'next-auth/client/_utils';
import type {
  BuiltInProviderType,
  RedirectableProviderType,
} from 'next-auth/providers';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import type {
  ClientSafeProvider,
  LiteralUnion,
  SessionProviderProps,
  SignInAuthorizationParams,
  SignInOptions,
  SignInResponse,
  SignOutParams,
  SignOutResponse,
} from 'next-auth/react';
import _logger, { proxyLogger } from 'next-auth/utils/logger';
import parseUrl from 'next-auth/utils/parse-url';
import { useEffect } from 'react';

// This behaviour mirrors the default behaviour for getting the site name that
// happens server side in server/index.js
// 1. An empty value is legitimate when the code is being invoked client side as
//    relative URLs are valid in that context and so defaults to empty.
// 2. When invoked server side the value is picked up from an environment
//    variable and defaults to 'http://localhost:3000'.
const __NEXTAUTH = {
  baseUrl: parseUrl(process.env.NEXTAUTH_URL ?? process.env.VERCEL_URL).origin,
  basePath: parseUrl(process.env.NEXTAUTH_URL).path,
  baseUrlServer: parseUrl(
    process.env.NEXTAUTH_URL_INTERNAL ??
      process.env.NEXTAUTH_URL ??
      process.env.VERCEL_URL
  ).origin,
  basePathServer: parseUrl(
    process.env.NEXTAUTH_URL_INTERNAL ?? process.env.NEXTAUTH_URL
  ).path,
  _lastSync: 0,
  _session: undefined,
  _getSession: () => {},
} as AuthClientConfig & {
  _session: CloudSession | null | undefined;
};

const broadcast = BroadcastChannel();

const logger = proxyLogger(_logger, __NEXTAUTH.basePath);

interface CloudSession extends Session {
  user: {
    id: string;
    hasPassword: boolean;
  } & DefaultSession['user'];
}

export type SessionContextValue<R extends boolean = false> = R extends true
  ?
      | {
          data: CloudSession;
          status: 'authenticated';
        }
      | {
          data: null;
          status: 'loading';
        }
  :
      | {
          data: CloudSession;
          status: 'authenticated';
        }
      | {
          data: null;
          status: 'unauthenticated' | 'loading';
        };

const sessionLoadingAtom = atom<boolean>(false);
const sessionValueAtom = atom<CloudSession | null>(null);

export function useSessionStatus() {
  return useAtomValue(sessionAtom).status;
}

export const sessionAtom = atom<
  SessionContextValue,
  [data?: any],
  Promise<Session | null | undefined>
>(
  get => {
    return {
      data: get(sessionValueAtom),
      status: get(sessionValueAtom)
        ? 'loading'
        : get(sessionLoadingAtom)
        ? 'authenticated'
        : 'unauthenticated',
    } as SessionContextValue;
  },
  async (get, set, data) => {
    const loading = get(sessionLoadingAtom);
    const session = get(sessionValueAtom);
    if (loading || !session) return;
    set(sessionLoadingAtom, true);
    const newSession = await fetchData<CloudSession>(
      'session',
      __NEXTAUTH,
      logger,
      {
        req: { body: { csrfToken: await getCsrfToken(), data } },
      }
    );
    set(sessionLoadingAtom, false);
    if (newSession) {
      set(sessionValueAtom, newSession);
      broadcast.post({ event: 'session', data: { trigger: 'getSession' } });
    }
    return newSession;
  }
);

export type GetSessionParams = CtxOrReq & {
  event?: 'storage' | 'timer' | 'hidden' | string;
  triggerEvent?: boolean;
  broadcast?: boolean;
};

export async function getSession(params?: GetSessionParams) {
  const session = await fetchData<CloudSession>(
    'session',
    __NEXTAUTH,
    logger,
    params
  );
  if (params?.broadcast ?? true) {
    broadcast.post({ event: 'session', data: { trigger: 'getSession' } });
  }
  return session;
}

/**
 * Returns the current Cross Site Request Forgery Token (CSRF Token)
 * required to make POST requests (e.g. for signing in and signing out).
 * You likely only need to use this if you are not using the built-in
 * `signIn()` and `signOut()` methods.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#getcsrftoken)
 */
export async function getCsrfToken(params?: CtxOrReq) {
  const response = await fetchData<{
    csrfToken: string;
  }>('csrf', __NEXTAUTH, logger, params);
  return response?.csrfToken;
}

/**
 * It calls `/api/auth/providers` and returns
 * a list of the currently configured authentication providers.
 * It can be useful if you are creating a dynamic custom sign in page.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#getproviders)
 */
export async function getProviders() {
  return await fetchData<
    Record<LiteralUnion<BuiltInProviderType>, ClientSafeProvider>
  >('providers', __NEXTAUTH, logger);
}

/**
 * Client-side method to initiate a signin flow
 * or send the user to the signin page listing all possible providers.
 * Automatically adds the CSRF token to the request.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#signin)
 */
export async function signIn<
  P extends RedirectableProviderType | undefined = undefined,
>(
  provider?: LiteralUnion<
    P extends RedirectableProviderType
      ? P | BuiltInProviderType
      : BuiltInProviderType
  >,
  options?: SignInOptions,
  authorizationParams?: SignInAuthorizationParams
): Promise<
  P extends RedirectableProviderType ? SignInResponse | undefined : undefined
> {
  const { callbackUrl = window.location.href, redirect = true } = options ?? {};

  const baseUrl = apiBaseUrl(__NEXTAUTH);
  const providers = await getProviders();

  if (!providers) {
    window.location.href = `${baseUrl}/error`;
    return;
  }

  if (!provider || !(provider in providers)) {
    window.location.href = `${baseUrl}/signin?${new URLSearchParams({
      callbackUrl,
    })}`;
    return;
  }

  const isCredentials = providers[provider].type === 'credentials';
  const isEmail = providers[provider].type === 'email';
  const isSupportingReturn = isCredentials || isEmail;

  const signInUrl = `${baseUrl}/${
    isCredentials ? 'callback' : 'signin'
  }/${provider}`;

  const _signInUrl = `${signInUrl}?${new URLSearchParams(authorizationParams)}`;

  const res = await fetch(_signInUrl, {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    body: new URLSearchParams({
      ...options,
      csrfToken: await getCsrfToken(),
      callbackUrl,
      json: true,
    }),
  });

  const data = await res.json();

  // TODO: Do not redirect for Credentials and Email providers by default in next major
  if (redirect || !isSupportingReturn) {
    const url = data.url ?? callbackUrl;
    window.location.href = url;
    // If url contains a hash, the browser does not reload the page. We reload manually
    if (url.includes('#')) window.location.reload();
    return;
  }

  const error = new URL(data.url).searchParams.get('error');

  if (res.ok) {
    await __NEXTAUTH._getSession({ event: 'storage' });
  }

  return {
    error,
    status: res.status,
    ok: res.ok,
    url: error ? null : data.url,
  } as any;
}

/**
 * Signs the user out, by removing the session cookie.
 * Automatically adds the CSRF token to the request.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#signout)
 */
export async function signOut<R extends boolean = true>(
  options?: SignOutParams<R>
): Promise<R extends true ? undefined : SignOutResponse> {
  const { callbackUrl = window.location.href } = options ?? {};
  const baseUrl = apiBaseUrl(__NEXTAUTH);
  const fetchOptions = {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    body: new URLSearchParams({
      csrfToken: await getCsrfToken(),
      callbackUrl,
      json: true,
    }),
  };
  const res = await fetch(`${baseUrl}/signout`, fetchOptions);
  const data = await res.json();

  broadcast.post({ event: 'session', data: { trigger: 'signout' } });

  if (options?.redirect ?? true) {
    const url = data.url ?? callbackUrl;
    window.location.href = url;
    // If url contains a hash, the browser does not reload the page. We reload manually
    if (url.includes('#')) window.location.reload();
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return;
  }

  await __NEXTAUTH._getSession({ event: 'storage' });

  return data;
}

/**
 * Provider to wrap the app in to make session data available globally.
 * Can also be used to throttle the number of requests to the endpoint
 * `/api/auth/session`.
 *
 * [Documentation](https://next-auth.js.org/getting-started/client#sessionprovider)
 */
export function SessionProvider(props: SessionProviderProps) {
  const {
    children,
    basePath,
    refetchInterval,
    refetchWhenOffline,
    refetchOnWindowFocus = true,
  } = props;

  if (basePath) __NEXTAUTH.basePath = basePath;

  const setSession = useSetAtom(sessionValueAtom);

  /** If the session was passed, initialize as not loading */
  const setLoading = useSetAtom(sessionLoadingAtom);

  useEffect(() => {
    __NEXTAUTH._getSession = async ({ event } = {}) => {
      try {
        const storageEvent = event === 'storage';
        // We should always update if we don't have a client session yet
        // or if there are events from other tabs/windows
        if (storageEvent || __NEXTAUTH._session === undefined) {
          __NEXTAUTH._lastSync = now();
          __NEXTAUTH._session = await getSession({
            broadcast: !storageEvent,
          });
          setSession(__NEXTAUTH._session);
          return;
        }

        if (
          // If there is no time defined for when a session should be considered
          // stale, then it's okay to use the value we have until an event is
          // triggered which updates it
          !event ||
          // If the client doesn't have a session then we don't need to call
          // the server to check if it does (if they have signed in via another
          // tab or window that will come through as a "stroage" event
          // event anyway)
          __NEXTAUTH._session === null ||
          // Bail out early if the client session is not stale yet
          now() < __NEXTAUTH._lastSync
        ) {
          return;
        }

        // An event or session staleness occurred, update the client session.
        __NEXTAUTH._lastSync = now();
        __NEXTAUTH._session = await getSession();
        setSession(__NEXTAUTH._session);
      } catch (error) {
        logger.error('CLIENT_SESSION_ERROR', error as Error);
      } finally {
        setLoading(false);
      }
    };

    __NEXTAUTH._getSession();

    return () => {
      __NEXTAUTH._lastSync = 0;
      __NEXTAUTH._session = undefined;
      __NEXTAUTH._getSession = () => {};
    };
  }, [setLoading, setSession]);

  useEffect(() => {
    // Listen for storage events and update session if event fired from
    // another window (but suppress firing another event to avoid a loop)
    // Fetch new session data but tell it to not to fire another event to
    // avoid an infinite loop.
    // Note: We could pass session data through and do something like
    // `setData(message.data)` but that can cause problems depending
    // on how the session object is being used in the client; it is
    // more robust to have each window/tab fetch it's own copy of the
    // session object rather than share it across instances.
    const unsubscribe = broadcast.receive(() =>
      __NEXTAUTH._getSession({ event: 'storage' })
    );

    return () => unsubscribe();
  }, []);
  useEffect(() => {
    // Listen for when the page is visible, if the user switches tabs
    // and makes our tab visible again, re-fetch the session, but only if
    // this feature is not disabled.
    const visibilityHandler = () => {
      if (refetchOnWindowFocus && document.visibilityState === 'visible')
        __NEXTAUTH._getSession({ event: 'visibilitychange' });
    };
    document.addEventListener('visibilitychange', visibilityHandler, false);
    return () =>
      document.removeEventListener(
        'visibilitychange',
        visibilityHandler,
        false
      );
  }, [refetchOnWindowFocus]);

  const isOnline = useSystemOnline();
  // TODO: Flip this behavior in next major version
  const shouldRefetch = refetchWhenOffline !== false || isOnline;

  useEffect(() => {
    if (refetchInterval && shouldRefetch) {
      const refetchIntervalTimer = setInterval(() => {
        if (__NEXTAUTH._session) {
          __NEXTAUTH._getSession({ event: 'poll' });
        }
      }, refetchInterval * 1000);
      return () => clearInterval(refetchIntervalTimer);
    }
    return;
  }, [refetchInterval, shouldRefetch]);

  return children;
}
