import {
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
} from '@affine/datacenter';

import { config } from './env';

let prefixUrl = '/';
if (typeof window === 'undefined') {
  // SSR
  if (config.serverAPI.startsWith('100')) {
    // This is for Server side rendering support
    prefixUrl = new URL('http://' + config.serverAPI + '/').origin;
  } else {
    console.warn('serverAPI is not a valid URL', config.serverAPI);
  }
}

const bareAuth = createBareClient(prefixUrl);
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
export const apis = getApis(bareAuth, clientAuth, googleAuth);
