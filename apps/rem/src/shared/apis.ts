import {
  createAuthClient,
  createBareClient,
  getApis,
  GoogleAuth,
} from '@affine/datacenter';

const bareAuth = createBareClient('/');
const googleAuth = new GoogleAuth(bareAuth);
const clientAuth = createAuthClient(bareAuth, googleAuth);
export const apis = getApis(bareAuth, clientAuth, googleAuth);
