import { DebugLogger } from '@affine/debug';
import { getBaseUrl } from '@affine/graphql';
import { useMemo, useReducer } from 'react';
import useSWR from 'swr';

import { SessionFetchErrorRightAfterLoginOrSignUp } from '../../unexpected-application-state/errors';
import { useAsyncCallback } from '../affine-async-hooks';

const logger = new DebugLogger('auth');

interface User {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean;
  avatarUrl: string | null;
  emailVerified: string | null;
}

export interface Session {
  user?: User | null;
  status: 'authenticated' | 'unauthenticated' | 'loading';
  reload: () => Promise<void>;
}

export type CheckedUser = Session['user'] & {
  update: (changes?: Partial<User>) => void;
};

export async function getSession(
  url: string = getBaseUrl() + '/api/auth/session'
) {
  try {
    const res = await fetch(url);

    if (res.ok) {
      return (await res.json()) as { user?: User | null };
    }

    logger.error('Failed to fetch session', res.statusText);
    return { user: null };
  } catch (e) {
    logger.error('Failed to fetch session', e);
    return { user: null };
  }
}

export function useSession(): Session {
  const { data, mutate, isLoading } = useSWR('session', () => getSession());

  return {
    user: data?.user,
    status: isLoading
      ? 'loading'
      : data?.user
        ? 'authenticated'
        : 'unauthenticated',
    reload: async () => {
      return mutate().then(e => {
        console.error(e);
      });
    },
  };
}

type UpdateSessionAction =
  | {
      type: 'update';
      payload?: Partial<User>;
    }
  | {
      type: 'fetchError';
      payload: null;
    };

function updateSessionReducer(prevState: User, action: UpdateSessionAction) {
  const { type, payload } = action;
  switch (type) {
    case 'update':
      return { ...prevState, ...payload };
    case 'fetchError':
      return prevState;
  }
}

/**
 * This hook checks if the user is logged in.
 * If so, the user object will be cached and returned.
 * If not, and there is no cache, it will throw an error.
 * If network error or API response error, it will use the cached value.
 */
export function useCurrentUser(): CheckedUser {
  const session = useSession();

  const [user, dispatcher] = useReducer(
    updateSessionReducer,
    session.user,
    firstSession => {
      if (!firstSession) {
        // barely possible.
        // login succeed but the session request failed then.
        // also need a error boundary to handle this error.
        throw new SessionFetchErrorRightAfterLoginOrSignUp(
          'Fetching session failed',
          () => {
            getSession()
              .then(session => {
                if (session.user) {
                  dispatcher({
                    type: 'update',
                    payload: session.user,
                  });
                }
              })
              .catch(err => {
                console.error(err);
              });
          }
        );
      }

      return firstSession;
    }
  );

  const update = useAsyncCallback(
    async (changes?: Partial<User>) => {
      dispatcher({
        type: 'update',
        payload: changes,
      });

      await session.reload();
    },
    [dispatcher, session]
  );

  return useMemo(
    () => ({
      ...user,
      update,
    }),
    // only list the things will change as deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, user.avatarUrl, user.name, update]
  );
}
