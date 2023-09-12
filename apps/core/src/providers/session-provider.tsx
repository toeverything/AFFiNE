import '@toeverything/hooks/use-affine-ipc-renderer';

import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { SessionProvider, useSession } from '@toeverything/auth/react';
import { sessionAtom } from '@toeverything/auth/react';
import { useAtom, useSetAtom } from 'jotai';
import {
  type PropsWithChildren,
  startTransition,
  useEffect,
  useRef,
} from 'react';

import { useOnceSignedInEvents } from '../atoms/event';

const useRefreshHook = () => {
  const session = useSession();
  const prevSession = useRef<ReturnType<typeof useSession>>();
  const [sessionInAtom, setSession] = useAtom(sessionAtom);
  const pushNotification = useSetAtom(pushNotificationAtom);
  const refreshMetadata = useSetAtom(refreshRootMetadataAtom);
  const onceSignedInEvents = useOnceSignedInEvents();
  const t = useAFFiNEI18N();

  useEffect(() => {
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
  }, [
    onceSignedInEvents,
    pushNotification,
    refreshMetadata,
    session,
    sessionInAtom,
    setSession,
    t,
  ]);
};

export const CloudSessionProvider = ({ children }: PropsWithChildren) => {
  useRefreshHook();
  return <SessionProvider refetchOnWindowFocus>{children}</SessionProvider>;
};
