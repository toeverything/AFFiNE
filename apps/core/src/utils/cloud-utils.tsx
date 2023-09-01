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
    } else {
      const [options, ...tail] = rest;
      const callbackUrl =
        runtimeConfig.serverUrlPrefix +
        (provider === 'email' ? '/open-app/oauth-jwt' : location.pathname);
      return signIn(
        provider,
        {
          ...options,
          callbackUrl: buildCallbackUrl(callbackUrl),
        },
        ...tail
      );
    }
  } else {
    return signIn(provider, ...rest);
  }
};

export const signOutCloud: typeof signOut = async options => {
  return signOut({
    ...options,
    callbackUrl: '/',
  }).then(result => {
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
