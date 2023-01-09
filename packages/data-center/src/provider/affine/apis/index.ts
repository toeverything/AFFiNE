export { token } from './token.js';
export type { Callback } from './token.js';

import { getAuthorizer } from './token.js';
import * as user from './user.js';
import * as workspace from './workspace.js';

export type Apis = typeof user &
  typeof workspace & {
    signInWithGoogle: ReturnType<typeof getAuthorizer>[0];
    onAuthStateChanged: ReturnType<typeof getAuthorizer>[1];
  };

export const getApis = (): Apis => {
  const [signInWithGoogle, onAuthStateChanged] = getAuthorizer();
  return {
    ...user,
    ...workspace,
    signInWithGoogle,
    onAuthStateChanged,
  };
};

export type { AccessTokenMessage } from './token';
export type { Member, Workspace, WorkspaceDetail } from './workspace';
export { WorkspaceType } from './workspace.js';
