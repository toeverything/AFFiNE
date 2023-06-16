import { DebugLogger } from '@affine/debug';
import {
  getLoginStorage,
  isExpired,
  parseIdToken,
  setLoginStorage,
  storageChangeSlot,
} from '@affine/workspace/affine/login';
import { affineAuth } from '@affine/workspace/affine/shared';
import useSWR from 'swr';

const logger = new DebugLogger('auth-token');

const revalidate = async () => {
  const storage = getLoginStorage();
  if (storage) {
    try {
      const tokenMessage = parseIdToken(storage.token);
      logger.debug('revalidate affine user');
      if (isExpired(tokenMessage)) {
        logger.debug('need to refresh token');
        const response = await affineAuth.refreshToken(storage);
        if (response) {
          setLoginStorage(response);
          storageChangeSlot.emit();
        }
      }
    } catch (e) {
      return false;
    }
    return true;
  } else {
    return false;
  }
};

export function useAffineRefreshAuthToken(
  // every 30 seconds, check if the token is expired
  refreshInterval = 30 * 1000
) {
  const { data } = useSWR<boolean>('autoRefreshToken', {
    suspense: true,
    fetcher: revalidate,
    refreshInterval,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateOnMount: true,
  });
  return data;
}
