import { OAuthProviderType } from '@affine/graphql';
import type { LoaderFunction } from 'react-router-dom';
import { z } from 'zod';

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

  // sign out first
  await fetch('/api/auth/sign-out');

  const maybeProvider = supportedProvider.safeParse(provider);
  if (maybeProvider.success) {
    let provider = maybeProvider.data;
    // BACKWARD COMPATIBILITY
    if (provider === 'google') {
      provider = OAuthProviderType.Google;
    }
    location.href = `${
      runtimeConfig.serverUrlPrefix
    }/oauth/login?provider=${provider}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}`;
  }
  return null;
};

export const Component = () => {
  return null;
};
