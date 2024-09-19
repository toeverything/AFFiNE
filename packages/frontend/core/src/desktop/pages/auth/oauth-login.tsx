import { AuthService } from '@affine/core/modules/cloud';
import { OAuthProviderType } from '@affine/graphql';
import { useService } from '@toeverything/infra';
import { useEffect } from 'react';
import {
  type LoaderFunction,
  redirect,
  useLoaderData,
  // eslint-disable-next-line @typescript-eslint/no-restricted-imports
  useNavigate,
} from 'react-router-dom';
import { z } from 'zod';

import { supportedClient } from './common';

const supportedProvider = z.nativeEnum(OAuthProviderType);

const oauthParameters = z.object({
  provider: supportedProvider,
  client: supportedClient,
  redirectUri: z.string().optional().nullable(),
});

interface LoaderData {
  provider: OAuthProviderType;
  client: string;
  redirectUri?: string;
}

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const provider = searchParams.get('provider');
  const client = searchParams.get('client') ?? 'web';
  const redirectUri = searchParams.get('redirect_uri');

  // sign out first, web only
  if (client === 'web') {
    await fetch('/api/auth/sign-out');
  }

  const paramsParseResult = oauthParameters.safeParse({
    provider,
    client,
    redirectUri,
  });

  if (paramsParseResult.success) {
    return {
      provider,
      client,
      redirectUri,
    };
  }

  return redirect(
    `/sign-in?error=${encodeURIComponent(`Invalid oauth parameters`)}`
  );
};

export const Component = () => {
  const auth = useService(AuthService);
  const data = useLoaderData() as LoaderData;

  const nav = useNavigate();

  useEffect(() => {
    auth
      .oauthPreflight(data.provider, data.client, data.redirectUri)
      .then(url => {
        // this is the url of oauth provider auth page, can't navigate with react-router
        location.href = url;
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [data, auth, nav]);

  return null;
};
