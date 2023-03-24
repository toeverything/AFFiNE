import {
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
} from '@affine/datacenter';
import { config } from '@affine/env';
import {
  createUserApis,
  createWorkspaceApis,
} from '@affine/workspace/affine/api';

import { isValidIPAddress } from '../utils/is-valid-ip-address';

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

declare global {
  // eslint-disable-next-line no-var
  var affineApis:
    | undefined
    | (ReturnType<typeof createUserApis> &
        ReturnType<typeof createWorkspaceApis>);
}

const affineApis = {} as ReturnType<typeof createUserApis> &
  ReturnType<typeof createWorkspaceApis>;
Object.assign(affineApis, createUserApis(prefixUrl));
Object.assign(affineApis, createWorkspaceApis(prefixUrl));
if (!globalThis.affineApis) {
  globalThis.affineApis = affineApis;
}

const bareAuth = createBareClient(prefixUrl);
const googleAuth = new GoogleAuth(bareAuth);
export const clientAuth = createAuthClient(bareAuth, googleAuth);
export const apis = getApis(bareAuth, clientAuth, googleAuth);

if (!globalThis.AFFINE_APIS) {
  globalThis.AFFINE_APIS = apis;
}

declare global {
  // eslint-disable-next-line no-var
  var AFFINE_APIS: ReturnType<typeof getApis>;
}
