import '@toeverything/hooks/use-affine-ipc-renderer';

import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { useAtom, useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { SessionProvider, useSession } from 'next-auth/react';
import { type PropsWithChildren, startTransition, useRef } from 'react';

import { sessionAtom } from '../atoms/cloud-user';
import { useOnceSignedInEvents } from '../atoms/event';

const SessionDefence = (props: PropsWithChildren) => {
  const session = useSession();
  const prevSession = useRef<ReturnType<typeof useSession>>();
  const [sessionInAtom, setSession] = useAtom(sessionAtom);
  const pushNotification = useSetAtom(pushNotificationAtom);
  const refreshMetadata = useSetAtom(refreshRootMetadataAtom);
  const onceSignedInEvents = useOnceSignedInEvents();
  const t = useAFFiNEI18N();

  if (sessionInAtom !== session && session.status === 'authenticated') {
    setSession(session);
  }

  if (prevSession.current !== session && session.status !== 'loading') {
    // unauthenticated -> authenticated
    if (
      prevSession.current?.status === 'unauthenticated' &&
      session.status === 'authenticated'
    ) {
      startTransition(() => {
        onceSignedInEvents().then(() => {
          refreshMetadata();
        });
      });
      pushNotification({
        title: t['com.affine.auth.has.signed'](),
        message: t['com.affine.auth.has.signed.message'](),
        type: 'success',
      });

      if (isDesktop) {
        window.affine.ipcRenderer.send('affine:login');
      }
    }
    prevSession.current = session;
  }
  return props.children;
};

export const CloudSessionProvider = ({ children }: PropsWithChildren) => {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SessionDefence>{children}</SessionDefence>
    </SessionProvider>
  );
};
