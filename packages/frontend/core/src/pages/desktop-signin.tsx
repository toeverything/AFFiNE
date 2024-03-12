import { OAuthProviderType } from '@affine/graphql';
import { type LoaderFunction } from 'react-router-dom';
import { z } from 'zod';

import { getSession } from '../hooks/affine/use-current-user';
import { signInCloud, signOutCloud } from '../utils/cloud-utils';

const supportedProvider = z.enum([
  'google',
  ...Object.values(OAuthProviderType),
]);

export const loader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const provider = searchParams.get('provider');
  const redirectUri =
    searchParams.get('redirect_uri') ??
    /* backward compatibility */ searchParams.get('callback_url');

  if (!redirectUri) {
    return null;
  }

  const session = await getSession();

  if (session.user) {
    // already signed in, need to sign out first
    await signOutCloud(request.url);
  }

  const maybeProvider = supportedProvider.safeParse(provider);
  if (maybeProvider.success) {
    let provider = maybeProvider.data;
    // BACKWARD COMPATIBILITY
    if (provider === 'google') {
      provider = OAuthProviderType.Google;
    }
    await signInCloud(provider, undefined, {
      redirectUri,
    });
  }
  return null;
};

export const Component = () => {
  return null;
};
