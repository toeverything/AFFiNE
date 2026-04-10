import { useService } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import {
  type LoaderFunction,
  redirect,
  useLoaderData,
  useNavigate,
} from 'react-router-dom';

import { AuthService } from '../../../modules/cloud';
import {
  buildAuthenticationDeepLink,
  buildOpenAppUrlRoute,
} from '../../../modules/open-in-app';
import { supportedClient } from './common';
import {
  type OAuthFlowMode,
  parseOAuthCallbackState,
  resolveOAuthRedirect,
} from './oauth-flow';

interface LoaderData {
  state: string;
  code: string;
  flow: OAuthFlowMode;
  provider: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const queries = url.searchParams;
  const code = queries.get('code');
  let stateStr = queries.get('state') ?? '{}';

  if (!code || !stateStr) {
    return redirect('/sign-in?error=Invalid oauth callback parameters');
  }

  try {
    const { state, client, flow, provider } = parseOAuthCallbackState(stateStr);

    if (!state || !provider) {
      return redirect('/sign-in?error=Invalid oauth callback parameters');
    }

    stateStr = state;

    const payload: LoaderData = {
      state,
      code,
      flow,
      provider,
    };

    if (!client || client === 'web') {
      return payload;
    }

    const clientCheckResult = supportedClient.safeParse(client);
    if (!clientCheckResult.success) {
      return redirect('/sign-in?error=Invalid oauth callback parameters');
    }

    const urlToOpen = buildAuthenticationDeepLink({
      scheme: clientCheckResult.data,
      method: 'oauth',
      payload,
      server: location.origin,
    });

    return redirect(buildOpenAppUrlRoute(urlToOpen));
  } catch {
    return redirect('/sign-in?error=Invalid oauth callback parameters');
  }
};

export const Component = () => {
  const auth = useService(AuthService);
  const data = useLoaderData() as LoaderData;

  // loader data from useLoaderData is not reactive, so that we can safely
  // assume the effect below is only triggered once
  const triggeredRef = useRef(false);

  const nav = useNavigate();

  useEffect(() => {
    if (triggeredRef.current) {
      return;
    }
    triggeredRef.current = true;
    auth
      .signInOauth(data.code, data.state, data.provider)
      .then(({ redirectUri }) => {
        if (data.flow === 'popup') {
          window.close();
          return;
        }

        location.replace(resolveOAuthRedirect(redirectUri, location.origin));
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [data, auth, nav]);

  return null;
};
