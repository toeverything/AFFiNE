import { type User } from '@affine/component/auth-components';
import type { DefaultSession, Session } from 'next-auth';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { getSession, useSession } from 'next-auth/react';
import { useEffect, useMemo, useReducer } from 'react';

import { SessionFetchErrorRightAfterLoginOrSignUp } from '../../unexpected-application-state/errors';

export type CheckedUser = User & {
  hasPassword: boolean;
  update: ReturnType<typeof useSession>['update'];
};

declare module 'next-auth' {
  interface Session {
    user: {
      name: string;
      email: string;
      id: string;
      hasPassword: boolean;
    } & Omit<NonNullable<DefaultSession['user']>, 'name' | 'email'>;
  }
}

type UpdateSessionAction =
  | {
      type: 'update';
      payload: Session;
    }
  | {
      type: 'fetchError';
      payload: null;
    };

function updateSessionReducer(prevState: Session, action: UpdateSessionAction) {
  const { type, payload } = action;
  switch (type) {
    case 'update':
      return payload;
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
  const { data, update } = useSession();

  const [session, dispatcher] = useReducer(
    updateSessionReducer,
    data,
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
                if (session) {
                  dispatcher({
                    type: 'update',
                    payload: session,
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

  useEffect(() => {
    if (data) {
      dispatcher({
        type: 'update',
        payload: data,
      });
    } else {
      dispatcher({
        type: 'fetchError',
        payload: null,
      });
    }
  }, [data, update]);

  const user = session.user;

  return useMemo(() => {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      hasPassword: user?.hasPassword ?? false,
      update,
    };
  }, [user, update]);
}
