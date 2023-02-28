import { toast } from '@affine/component';
import { DataCenter, MessageCenter } from '@affine/datacenter';
import { AffineProvider } from '@affine/datacenter';
import { DebugLogger } from '@affine/debug';
import { useRouter } from 'next/router';
import { ReactNode, useCallback, useEffect } from 'react';

import { useGlobalState } from '@/store/app';

const logger = new DebugLogger('messageCenter');

const clearAuth = (dataCenter: DataCenter, providerName: string) => {
  const affineProvider = dataCenter.providers.find(p => p.id === providerName);
  if (affineProvider && affineProvider instanceof AffineProvider) {
    affineProvider.apis.auth.clear();
  } else {
    logger.error('cannot find affine provider, please fix this ASAP');
  }
};
export function MessageCenterHandler({ children }: { children?: ReactNode }) {
  const router = useRouter();
  const dataCenter = useGlobalState(useCallback(store => store.dataCenter, []));
  useEffect(() => {
    const instance = MessageCenter.getInstance();
    if (instance) {
      return instance.onMessage(async message => {
        if (message.code === MessageCenter.messageCode.noPermission) {
          // todo: translate message
          // todo: more specific message for accessing different resources
          // todo: error toast style
          toast('You have no permission to access this workspace');
          // todo(himself65): remove dynamic lookup
          clearAuth(dataCenter, 'affine');
          // the status of the app right now is unknown, and it won't help if we let
          // the app continue and let the user auth the app.
          // that's why so we need to reload the page for now.
          //
          // fix: a better option is to keep loading the app, and prompt the user to login
          // or perhaps displaying page 401?
          await router.push('/');
          router.reload();
        }

        if (message.code === MessageCenter.messageCode.refreshTokenError) {
          toast('Session expired, please log in again');
          clearAuth(dataCenter, 'affine');
          await router.push('/');
          router.reload();
        }
      });
    }
  }, [dataCenter, router]);

  return <>{children}</>;
}
