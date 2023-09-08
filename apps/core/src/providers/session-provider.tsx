import '@toeverything/hooks/use-affine-ipc-renderer';

import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { SessionProvider, useSession } from 'next-auth/react';
import { type PropsWithChildren, startTransition, useRef } from 'react';

import { useOnceSignedInEvents } from '../atoms/event';

const SessionReporter = () => {
  const session = useSession();
  const prevSession = useRef<ReturnType<typeof useSession>>();
  const pushNotification = useSetAtom(pushNotificationAtom);
  const refreshMetadata = useSetAtom(refreshRootMetadataAtom);
  const onceSignedInEvents = useOnceSignedInEvents();
  const t = useAFFiNEI18N();

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
  return null;
};

export const CloudSessionProvider = ({ children }: PropsWithChildren) => {
  return (
    <SessionProvider refetchOnWindowFocus>
      <SessionReporter />
      {children}
    </SessionProvider>
  );
};
