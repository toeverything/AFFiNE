export type { Callback } from './google';

import type { KyInstance } from 'ky/distribution/types/ky';

import type { createGoogleAuth, GoogleAuth } from './google';
import { getAuthorizer } from './google';
import { createUserApis } from './user';
import { createWorkspaceApis } from './workspace';

// See https://twitter.com/mattpocockuk/status/1622730173446557697
// TODO: move to ts utils?
type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line @typescript-eslint/ban-types
} & {};

export type Apis = Prettify<
  ReturnType<typeof createUserApis> &
    ReturnType<typeof createWorkspaceApis> & {
      signInWithGoogle: ReturnType<typeof getAuthorizer>[0];
      onAuthStateChanged: ReturnType<typeof getAuthorizer>[1];
      signOutFirebase: ReturnType<typeof getAuthorizer>[2];
    } & { auth: ReturnType<typeof createGoogleAuth> }
>;

export const getApis = (
  bareClient: KyInstance,
  authClient: KyInstance,
  googleAuth: GoogleAuth
): Apis => {
  const [signInWithGoogle, onAuthStateChanged, signOutFirebase] =
    getAuthorizer(googleAuth);
  return {
    ...createUserApis(bareClient, authClient),
    ...createWorkspaceApis(bareClient, authClient, googleAuth),
    signInWithGoogle,
    signOutFirebase,
    onAuthStateChanged,
    auth: googleAuth,
  };
};

export type { AccessTokenMessage } from './google';
export type { Member, Workspace, WorkspaceDetail } from './workspace';
export * from './workspace';
