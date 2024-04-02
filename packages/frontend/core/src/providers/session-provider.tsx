import { notify } from '@affine/component';
import { useSession } from '@affine/core/hooks/affine/use-current-user';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { affine } from '@affine/electron-api';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY } from '@affine/workspace-impl';
import type { PropsWithChildren } from 'react';
import { startTransition, useEffect, useRef } from 'react';

import { useOnceSignedInEvents } from '../atoms/event';
import { mixpanel } from '../utils';

export const CloudSessionProvider = (props: PropsWithChildren) => {
  const session = useSession();
  const prevSession = useRef<ReturnType<typeof useSession>>();
  const onceSignedInEvents = useOnceSignedInEvents();
  const t = useAFFiNEI18N();

  const refreshAfterSignedInEvents = useAsyncCallback(async () => {
    await onceSignedInEvents();
    new BroadcastChannel(
      CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
    ).postMessage(1);
  }, [onceSignedInEvents]);

  useEffect(() => {
    if (session.user?.id) {
      mixpanel.identify(session.user.id);
    }
  }, [session]);

  useEffect(() => {
    if (prevSession.current !== session && session.status !== 'loading') {
      // unauthenticated -> authenticated
      if (
        prevSession.current?.status === 'unauthenticated' &&
        session.status === 'authenticated'
      ) {
        startTransition(() => refreshAfterSignedInEvents());
        notify.success({
          title: t['com.affine.auth.has.signed'](),
          message: t['com.affine.auth.has.signed.message'](),
        });

        if (environment.isDesktop) {
          affine?.ipcRenderer.send('affine:login');
        }
      }
      prevSession.current = session;
    }
  }, [session, prevSession, refreshAfterSignedInEvents, t]);

  return props.children;
};
