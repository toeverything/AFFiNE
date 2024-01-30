import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { Suspense, useEffect } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { CurrentWorkspaceService } from '../../../modules/workspace/current-workspace';

const SyncAwarenessInnerLoggedIn = () => {
  const currentUser = useCurrentUser();
  const currentWorkspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );

  useEffect(() => {
    if (currentUser && currentWorkspace) {
      currentWorkspace.blockSuiteWorkspace.awarenessStore.awareness.setLocalStateField(
        'user',
        {
          name: currentUser.name,
          // todo: add avatar?
        }
      );

      return () => {
        currentWorkspace.blockSuiteWorkspace.awarenessStore.awareness.setLocalStateField(
          'user',
          null
        );
      };
    }
    return;
  }, [currentUser, currentWorkspace]);

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
