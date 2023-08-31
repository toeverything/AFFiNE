import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { getCurrentStore } from '@toeverything/infra/atom';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { signIn, signOut } from 'next-auth/react';
import { startTransition } from 'react';

export const signInCloud: typeof signIn = async (...args) => {
  return signIn(...args).then(result => {
    // do not refresh root metadata,
    // because the session won't change in this callback
    return result;
  });
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
