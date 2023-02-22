import { toast } from '@affine/component';
import { MessageCenter } from '@affine/datacenter';
import { AffineProvider } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { ReactNode, useCallback, useEffect } from 'react';

import { useGlobalState } from '@/store/app';

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
          const affineProvider = dataCenter.providers.find(
            p => p.id === 'affine'
          );
          if (affineProvider && affineProvider instanceof AffineProvider) {
            affineProvider.apis.auth.clear();
          } else {
            console.error('cannot find affine provider, please fix this ASAP');
          }
          // the status of the app right now is unknown, and it won't help if we let
          // the app continue and let the user auth the app.
          // that's why so we need to reload the page for now.
          //
          // fix: a better option is to keep loading the app, and prompt the user to login
          // or perhaps displaying page 401?
          await router.push('/');
          router.reload();
        }
      });
    }
  }, [dataCenter?.providers, router]);

  return <>{children}</>;
}
