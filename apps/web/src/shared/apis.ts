import { config } from '@affine/env';
import {
  createUserApis,
  createWorkspaceApis,
} from '@affine/workspace/affine/api';
import { currentAffineUserAtom } from '@affine/workspace/affine/atom';
import type { LoginResponse } from '@affine/workspace/affine/login';
import { parseIdToken, setLoginStorage } from '@affine/workspace/affine/login';

import { jotaiStore } from '../atoms';
import { isValidIPAddress } from '../utils';

let prefixUrl = '/';
if (typeof window === 'undefined') {
  // SSR
  const serverAPI = config.serverAPI;
  if (isValidIPAddress(serverAPI.split(':')[0])) {
    // This is for Server side rendering support
    prefixUrl = new URL('http://' + config.serverAPI + '/').origin;
  } else {
    try {
      new URL(serverAPI);
    } catch (e) {
      console.warn('serverAPI is not a valid URL', config.serverAPI);
    }
  }
} else {
  const params = new URLSearchParams(window.location.search);
  params.get('prefixUrl') && (prefixUrl = params.get('prefixUrl') as string);
}

const affineApis = {} as ReturnType<typeof createUserApis> &
  ReturnType<typeof createWorkspaceApis>;
Object.assign(affineApis, createUserApis(prefixUrl));
Object.assign(affineApis, createWorkspaceApis(prefixUrl));

if (!globalThis.AFFINE_APIS) {
  globalThis.AFFINE_APIS = affineApis;
  globalThis.setLogin = (response: LoginResponse) => {
    jotaiStore.set(currentAffineUserAtom, parseIdToken(response.token));
    setLoginStorage(response);
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
}

export { affineApis };
