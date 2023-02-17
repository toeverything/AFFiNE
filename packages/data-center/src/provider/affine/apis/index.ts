// export { token } from './token.js';
export type { Callback } from './auth';

import { getAuthorizer } from './auth';
import { auth } from './auth';
import * as user from './user';
import * as workspace from './workspace';

// See https://twitter.com/mattpocockuk/status/1622730173446557697
// TODO: move to ts utils?
type Prettify<T> = {
  [K in keyof T]: T[K];
  // eslint-disable-next-line @typescript-eslint/ban-types
} & {};

export type Apis = Prettify<
  typeof user &
    Omit<typeof workspace, 'WorkspaceType' | 'PermissionType'> & {
      signInWithGoogle: ReturnType<typeof getAuthorizer>[0];
      onAuthStateChanged: ReturnType<typeof getAuthorizer>[1];
      signOutFirebase: ReturnType<typeof getAuthorizer>[2];
    } & { auth: typeof auth }
>;

export const getApis = (): Apis => {
  const [signInWithGoogle, onAuthStateChanged, signOutFirebase] =
    getAuthorizer();
  return {
    ...user,
    ...workspace,
    signInWithGoogle,
    signOutFirebase,
    onAuthStateChanged,
    auth,
  };
};

export type { AccessTokenMessage } from './auth';
export type { Member, Workspace, WorkspaceDetail } from './workspace';
export * from './workspace';
