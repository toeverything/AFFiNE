import { useService } from '@toeverything/infra';
import { useEffect } from 'react';
import {
  type LoaderFunction,
  redirect,
  useLoaderData,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  useNavigate,
} from 'react-router-dom';

import { AuthService } from '../../../modules/cloud';
import { supportedClient } from './common';

interface LoaderData {
  token: string;
  email: string;
  redirectUri: string | null;
}

export const loader: LoaderFunction = ({ request }) => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const client = params.get('client');
  const email = params.get('email');
  const token = params.get('token');
  const redirectUri = params.get('redirect_uri');

  if (!email || !token) {
    return redirect('/sign-in?error=Invalid magic link');
  }

  const payload: LoaderData = {
    email,
    token,
    redirectUri,
  };

  if (!client || client === 'web') {
    return payload;
  }

  const clientCheckResult = supportedClient.safeParse(client);
  if (!clientCheckResult.success) {
    return redirect('/sign-in?error=Invalid callback parameters');
  }

  const authParams = new URLSearchParams();
  authParams.set('method', 'magic-link');
  authParams.set('payload', JSON.stringify(payload));

  return redirect(
    `/open-app/url?url=${encodeURIComponent(`${client}://authentication?${authParams.toString()}`)}`
  );
};

export const Component = () => {
  // TODO(@eyhn): loading ui
  const auth = useService(AuthService);
  const data = useLoaderData() as LoaderData;

  const nav = useNavigate();

  useEffect(() => {
    auth
      .signInMagicLink(data.email, data.token)
      .then(() => {
        nav(data.redirectUri ?? '/');
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [data, auth, nav]);

  return null;
};
