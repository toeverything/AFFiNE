/**
 * @deprecated Remove this file after we migrate to the new cloud.
 */
import { setupGlobal } from '@affine/env/global';
import { rootStore } from '@toeverything/plugin-infra/manager';

import { createUserApis, createWorkspaceApis } from './api/index';
import { currentAffineUserAtom } from './atom';
import type { LoginResponse } from './login';
import { createAffineAuth, parseIdToken, setLoginStorage } from './login';

setupGlobal();

export const affineAuth = createAffineAuth(prefixUrl);
const affineApis = {} as ReturnType<typeof createUserApis> &
  ReturnType<typeof createWorkspaceApis>;

Object.assign(affineApis, createUserApis(prefixUrl));
Object.assign(affineApis, createWorkspaceApis(prefixUrl));

if (!globalThis.AFFINE_APIS) {
  globalThis.AFFINE_APIS = affineApis;
  globalThis.setLogin = (response: LoginResponse) => {
    rootStore.set(currentAffineUserAtom, parseIdToken(response.token));
    setLoginStorage(response);
  };
  const loginMockUser1 = async () => {
    const user1 = await import('@affine-test/fixtures/built-in-user1.json');
    const data = await fetch(prefixUrl + 'api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user1.email,
        password: user1.password,
      }),
    }).then(r => r.json());
    setLogin(data);
  };
  const loginMockUser2 = async () => {
    const user2 = await import('@affine-test/fixtures/built-in-user2.json');
    const data = await fetch(prefixUrl + 'api/user/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'DebugLoginUser',
        email: user2.email,
        password: user2.password,
      }),
    }).then(r => r.json());
    setLogin(data);
  };

  globalThis.AFFINE_DEBUG = {
    loginMockUser1,
    loginMockUser2,
  };
}

declare global {
  // eslint-disable-next-line no-var
  var setLogin: typeof setLoginStorage;
  // eslint-disable-next-line no-var
  var AFFINE_APIS:
    | undefined
    | (ReturnType<typeof createUserApis> &
        ReturnType<typeof createWorkspaceApis>);
  // eslint-disable-next-line no-var
  var AFFINE_DEBUG: Record<string, unknown>;
}

export { affineApis };
