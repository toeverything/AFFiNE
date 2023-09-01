import { isDesktop } from '@affine/env/constant';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { getCurrentStore } from '@toeverything/infra/atom';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { signIn, signOut } from 'next-auth/react';
import { startTransition } from 'react';

export const signInCloud: typeof signIn = async (provider, ...rest) => {
  if (isDesktop) {
    if (provider === 'google') {
      open(
        `${
          runtimeConfig.serverUrlPrefix
        }/desktop-signin?provider=google&callback_url=${buildCallbackUrl(
          '/open-app/oauth-jwt'
        )}`,
        '_target'
      );
      return;
    } else if (provider === 'email') {
      const [options, ...tail] = rest;
      return signIn(
        provider,
        {
          ...options,
          callbackUrl: buildCallbackUrl('/open-app/oauth-jwt'),
        },
        ...tail
      );
    } else {
      throw new Error('Unsupported provider');
    }
  } else {
    return signIn(provider, ...rest);
  }
};

export const signOutCloud: typeof signOut = async (...args) => {
  return signOut(...args).then(result => {
    if (result) {
      startTransition(() => {
        getCurrentStore().set(refreshRootMetadataAtom);
      });
    }
    return result;
  });
};

export function buildCallbackUrl(callbackUrl: string) {
  const params: string[][] = [];
  if (isDesktop && window.appInfo.schema) {
    params.push(['schema', window.appInfo.schema]);
  }
  const query =
    params.length > 0
      ? '?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
  return callbackUrl + query;
}
