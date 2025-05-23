import { AuthService } from '@affine/core/modules/cloud';
import { useAsyncNavigate } from '@affine/core/utils';
import type { OAuthProviderType } from '@affine/graphql';
import { useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { useLoaderData } from 'react-router';

interface OAuthLoginLoaderData {
  provider: OAuthProviderType;
  client: string;
  redirectUri?: string;
}

export const Component = () => {
  const auth = useService(AuthService);
  const data = useLoaderData() as OAuthLoginLoaderData;

  const nav = useAsyncNavigate();

  useEffect(() => {
    auth
      .oauthPreflight(data.provider, data.client, data.redirectUri)
      .then(({ url }) => {
        // this is the url of oauth provider auth page, can't navigate with react-router
        location.href = url;
      })
      .catch(e => {
        nav(`/sign-in?error=${encodeURIComponent(e.message)}`);
      });
  }, [data, auth, nav]);

  return null;
};
