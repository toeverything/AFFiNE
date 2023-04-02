import { DebugLogger } from '@affine/debug';
import {
  getLoginStorage,
  isExpired,
  parseIdToken,
  setLoginStorage,
} from '@affine/workspace/affine/login';
import useSWR from 'swr';

import { affineAuth } from './use-affine-log-in';

const logger = new DebugLogger('auth-token');

const revalidate = async () => {
  const storage = getLoginStorage();
  if (storage) {
    const tokenMessage = parseIdToken(storage.token);
    logger.debug('revalidate affine user');
    if (isExpired(tokenMessage)) {
      logger.debug('need to refresh token');
      const response = await affineAuth.refreshToken(storage);
      if (response) {
        setLoginStorage(response);
      }
    }
  }
  return true;
};

export function useAffineRefreshAuthToken() {
  useSWR('autoRefreshToken', {
    fetcher: revalidate,
  });
}
