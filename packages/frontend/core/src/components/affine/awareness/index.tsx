import { useService, WorkspaceService } from '@toeverything/infra';
import { Suspense, useEffect } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { useSession } from '../../../hooks/affine/use-current-user';

const SyncAwarenessInnerLoggedIn = () => {
  const { user } = useSession();
  const currentWorkspace = useService(WorkspaceService).workspace;

  useEffect(() => {
    if (user && currentWorkspace) {
      currentWorkspace.docCollection.awarenessStore.awareness.setLocalStateField(
        'user',
        {
          name: user.name,
          // todo: add avatar?
        }
      );

      return () => {
        currentWorkspace.docCollection.awarenessStore.awareness.setLocalStateField(
          'user',
          null
        );
      };
    }
    return;
  }, [user, currentWorkspace]);

  return null;
};

const SyncAwarenessInner = () => {
  const loginStatus = useCurrentLoginStatus();

  if (loginStatus === 'authenticated') {
    return <SyncAwarenessInnerLoggedIn />;
  }

  return null;
};

// todo: we could do something more interesting here, e.g., show where the current user is
export const SyncAwareness = () => {
  return (
    <Suspense>
      <SyncAwarenessInner />
    </Suspense>
  );
};
