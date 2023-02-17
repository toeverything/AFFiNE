import { toast } from '@affine/component';
import { getApis, MessageCenter } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

export function MessageCenterHandler({
  children,
}: {
  children?: React.ReactNode;
}) {
  const router = useRouter();
  useEffect(() => {
    const instance = MessageCenter.getInstance();
    if (instance) {
      return instance.onMessage(async message => {
        if (message.code === MessageCenter.messageCode.noPermission) {
          // todo: translate message
          // todo: more specific message for accessing different resources
          // todo: error toast style
          toast('You have no permission to access this workspace');
          getApis().auth.clear();
          // the status of the app right now is unknown, and it won't help if we let
          // the app continue and let the user auth the app.
          // that's why so we need to reload the page for now.
          //
          // fix: a better option is to keep loading the app, and prompt the user to login
          // or perhaps displaying page 401?
          router.reload();
        }
      });
    }
  }, [router]);

  return <>{children}</>;
}
