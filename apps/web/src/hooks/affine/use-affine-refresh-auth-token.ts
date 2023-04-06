import { DebugLogger } from '@affine/debug';
import {
  getLoginStorage,
  isExpired,
  parseIdToken,
  setLoginStorage,
} from '@affine/workspace/affine/login';
import useSWR from 'swr';

import { affineAuth } from '../../plugins/affine';

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

        // todo: need to notify the app that the token has been refreshed
        //  this is a hack to force a reload
        window.location.reload();
      }
    }
  }
  return true;
};

export function useAffineRefreshAuthToken(
  // every 30 seconds, check if the token is expired
  refreshInterval = 30 * 1000
) {
  useSWR('autoRefreshToken', {
    fetcher: revalidate,
    refreshInterval,
  });
}
