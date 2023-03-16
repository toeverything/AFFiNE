import {
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
} from '@affine/datacenter';
import { config } from '@affine/env';

import { isValidIPAddress } from '../utils/is-valid-ip-address';

let prefixUrl = '/';
if (typeof window === 'undefined') {
  // SSR
  const serverAPI = config.serverAPI;
  if (isValidIPAddress(serverAPI)) {
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

const bareAuth = createBareClient(prefixUrl);
const googleAuth = new GoogleAuth(bareAuth);
export const clientAuth = createAuthClient(bareAuth, googleAuth);
export const apis = getApis(bareAuth, clientAuth, googleAuth);
