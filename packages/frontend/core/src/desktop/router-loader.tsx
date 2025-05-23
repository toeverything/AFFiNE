import { DebugLogger } from '@affine/debug';
import { OAuthProviderType } from '@affine/graphql';
import { FACTORIES } from '@affine/routes';
import type { LoaderFunction } from 'react-router';
import { redirect } from 'react-router';
import { z } from 'zod';

import { appConfigStorage } from '../components/hooks/use-app-config-storage';
import { supportedClient } from './pages/auth/common';
import type { MagicLinkLoaderData } from './pages/auth/magic-link';
import type { OAuthCallbackLoaderData } from './pages/auth/oauth-callback';

const trustedDomain = [
  'google.com',
  'stripe.com',
  'github.com',
  'twitter.com',
  'discord.gg',
  'youtube.com',
  't.me',
  'reddit.com',
  'affine.pro',
];

const authTypeSchema = z.enum([
  'onboarding',
  'setPassword',
  'signIn',
  'changePassword',
  'signUp',
  'changeEmail',
  'confirm-change-email',
  'subscription-redirect',
  'verify-email',
]);

const supportedProvider = z.nativeEnum(OAuthProviderType);

const oauthParameters = z.object({
  provider: supportedProvider,
  client: supportedClient,
  redirectUri: z.string().optional().nullable(),
});

const redirectLogger = new DebugLogger('redirect_proxy');

/**
 * /onboarding page
 *
 * only for electron
 */
export const onboardingLoader = async () => {
  if (!BUILD_CONFIG.isElectron && !appConfigStorage.get('onBoarding')) {
    // onboarding is off, redirect to index
    return redirect('/');
  }

  return null;
};

/**
 * /redirect-proxy page
 *
 * only for web
 */
export const redirectLoader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const searchParams = url.searchParams;
  const redirectUri = searchParams.get('redirect_uri');

  if (!redirectUri) {
    return { allow: false };
  }

  try {
    const target = new URL(redirectUri);

    if (
      target.hostname === window.location.hostname ||
      trustedDomain.some(domain =>
        new RegExp(`.?${domain}$`).test(target.hostname)
      )
    ) {
      location.href = redirectUri;
      return { allow: true };
    }
  } catch (e) {
    redirectLogger.error('Failed to parse redirect uri', e);
    return { allow: false };
  }

  return { allow: true };
};

export const authLoader: LoaderFunction = async args => {
  if (!args.params.authType) {
    return redirect(FACTORIES.notFound());
  }
  if (!authTypeSchema.safeParse(args.params.authType).success) {
    return redirect(FACTORIES.notFound());
  }

  return null;
};

export const magicLinkLoader: LoaderFunction = ({ request }) => {
  const url = new URL(request.url);
  const params = url.searchParams;
  const client = params.get('client');
  const email = params.get('email');
  const token = params.get('token');
  const redirectUri = params.get('redirect_uri');

  if (!email || !token) {
    return redirect(FACTORIES.signIn() + '?error=Invalid magic link');
  }

  const payload: MagicLinkLoaderData = {
    email,
    token,
    redirectUri,
  };

  if (!client || client === 'web') {
    return payload;
  }

  const clientCheckResult = supportedClient.safeParse(client);
  if (!clientCheckResult.success) {
    return redirect(FACTORIES.signIn() + '?error=Invalid callback parameters');
  }

  const authParams = new URLSearchParams();
  authParams.set('method', 'magic-link');
  authParams.set('payload', JSON.stringify(payload));

  return redirect(
    `${FACTORIES.openApp({ action: 'url' })}?url=${encodeURIComponent(`${client}://authentication?${authParams.toString()}`)}`
  );
};

export const oauthLoginLoader: LoaderFunction = async ({ request }) => {
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
    `${FACTORIES.signIn()}?error=${encodeURIComponent(`Invalid oauth parameters`)}`
  );
};

export const oauthCallbackLoader: LoaderFunction = async ({ request }) => {
  const url = new URL(request.url);
  const queries = url.searchParams;
  const code = queries.get('code');
  let stateStr = queries.get('state') ?? '{}';

  if (!code || !stateStr) {
    return redirect(
      `${FACTORIES.signIn()}?error=${encodeURIComponent(`Invalid oauth callback parameters`)}`
    );
  }

  try {
    const { state, client, provider } = JSON.parse(stateStr);
    stateStr = state;

    const payload: OAuthCallbackLoaderData = {
      state,
      code,
      provider,
    };

    if (!client || client === 'web') {
      return payload;
    }

    const clientCheckResult = supportedClient.safeParse(client);
    if (!clientCheckResult.success) {
      return redirect(
        `${FACTORIES.signIn()}?error=${encodeURIComponent(`Invalid oauth callback parameters`)}`
      );
    }

    const authParams = new URLSearchParams();
    authParams.set('method', 'oauth');
    authParams.set('payload', JSON.stringify(payload));
    authParams.set('server', location.origin);

    return redirect(
      `${FACTORIES.openApp({ action: 'url' })}?url=${encodeURIComponent(`${client}://authentication?${authParams.toString()}`)}`
    );
  } catch {
    return redirect(
      `${FACTORIES.signIn()}?error=${encodeURIComponent(`Invalid oauth callback parameters`)}`
    );
  }
};
