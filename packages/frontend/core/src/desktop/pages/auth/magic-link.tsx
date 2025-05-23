import { useAsyncNavigate } from '@affine/core/utils/use-async-navigate';
import { useService } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import { useLoaderData } from 'react-router';

import { AuthService } from '../../../modules/cloud';
export interface MagicLinkLoaderData {
  token: string;
  email: string;
  redirectUri: string | null;
}

export const Component = () => {
  // TODO(@eyhn): loading ui
  const auth = useService(AuthService);
  const data = useLoaderData() as MagicLinkLoaderData;

  const nav = useAsyncNavigate();

  // loader data from useLoaderData is not reactive, so that we can safely
  // assume the effect below is only triggered once
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;
    auth
      .signInMagicLink(data.email, data.token)
      .then(() => {
        const subscription = auth.session.status$.subscribe(status => {
          if (status === 'authenticated') {
            nav(data.redirectUri ?? '/');
            subscription?.unsubscribe();
          }
        });
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [auth, data, data.email, data.redirectUri, data.token, nav]);

  return null;
};
