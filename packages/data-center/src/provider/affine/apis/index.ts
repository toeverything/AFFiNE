// export { token } from './token.js';
export type { Callback } from './token.js';

import { getAuthorizer } from './token.js';
import * as user from './user.js';
import * as workspace from './workspace.js';
import { token } from './token.js';

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
    } & { token: typeof token }
>;

export const getApis = (): Apis => {
  const [signInWithGoogle, onAuthStateChanged] = getAuthorizer();
  return {
    ...user,
    ...workspace,
    signInWithGoogle,
    onAuthStateChanged,
    token,
  };
};

export type { AccessTokenMessage } from './token';
export type { Member, Workspace, WorkspaceDetail } from './workspace';
export { WorkspaceType } from './workspace.js';
