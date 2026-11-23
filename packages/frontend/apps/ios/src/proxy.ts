import { canonicalAuthEndpoint } from '@affine/mobile-shared/auth/endpoint';
import {
  type AuthRequestProvider,
  installAuthRequestProxy,
} from '@affine/mobile-shared/auth/request';

import { Auth } from './plugins/auth';

export const authRequestProvider: AuthRequestProvider = {
  async getValidAccessToken(endpoint) {
    const { token } = await Auth.getValidAccessToken({
      endpoint: canonicalAuthEndpoint(endpoint),
    });
    return token ?? null;
  },
  async refreshAccessToken(endpoint) {
    const { token } = await Auth.refreshAccessToken({
      endpoint: canonicalAuthEndpoint(endpoint),
    });
    return token;
  },
};

installAuthRequestProxy(authRequestProvider);

export function getValidAccessToken(endpoint: string) {
  return authRequestProvider.getValidAccessToken(endpoint);
}

export async function clearEndpointSession(endpoint: string) {
  await Auth.clearEndpointSession({
    endpoint: canonicalAuthEndpoint(endpoint),
  });
}
