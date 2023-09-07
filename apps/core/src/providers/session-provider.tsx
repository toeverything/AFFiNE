import '@toeverything/hooks/use-affine-ipc-renderer';

import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { SessionProvider, useSession } from 'next-auth/react';
import { type PropsWithChildren, useRef } from 'react';

const SessionReporter = () => {
  const session = useSession();
  const prevSession = useRef<ReturnType<typeof useSession>>();
  const pushNotification = useSetAtom(pushNotificationAtom);
  const t = useAFFiNEI18N();

  if (prevSession.current !== session && session.status !== 'loading') {
    // unauthenticated -> authenticated
    if (
      prevSession.current?.status === 'unauthenticated' &&
      session.status === 'authenticated'
    ) {
      const email = session?.data?.user.email;
      pushNotification({
        title: `${email}${t['com.affine.auth.has.signed']()}`,
        message: '',
        key: Date.now().toString(),
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
