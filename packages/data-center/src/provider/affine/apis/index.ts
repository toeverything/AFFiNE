// export { token } from './token.js';
export type { Callback } from './auth.js';

import { getAuthorizer } from './auth.js';
import * as user from './user.js';
import * as workspace from './workspace.js';
import { auth } from './auth.js';

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
export { WorkspaceType } from './workspace.js';
