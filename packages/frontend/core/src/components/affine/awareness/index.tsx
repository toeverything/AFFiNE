import { Suspense, useEffect } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';

const SyncAwarenessInnerLoggedIn = () => {
  const currentUser = useCurrentUser();
  const [{ blockSuiteWorkspace: workspace }] = useCurrentWorkspace();

  useEffect(() => {
    if (currentUser && workspace) {
      workspace.awarenessStore.awareness.setLocalStateField('user', {
        name: currentUser.name,
        // todo: add avatar?
      });

      return () => {
        workspace.awarenessStore.awareness.setLocalStateField('user', null);
      };
    }
    return;
  }, [currentUser, workspace]);

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
