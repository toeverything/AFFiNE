import { useAsyncNavigate } from '@affine/core/utils/use-async-navigate';
import { useService } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import { useLoaderData } from 'react-router';

import { AuthService } from '../../../modules/cloud';

export interface OAuthCallbackLoaderData {
  state: string;
  code: string;
  provider: string;
}

export const Component = () => {
  const auth = useService(AuthService);
  const data = useLoaderData() as OAuthCallbackLoaderData;

  // loader data from useLoaderData is not reactive, so that we can safely
  // assume the effect below is only triggered once
  const triggeredRef = useRef(false);

  const nav = useAsyncNavigate();

  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;
    auth
      .signInOauth(data.code, data.state, data.provider)
      .then(() => {
        window.close();
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [data, auth, nav]);

  return null;
};
