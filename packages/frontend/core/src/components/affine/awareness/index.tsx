import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { Suspense, useEffect } from 'react';

import { AuthService } from '../../../modules/cloud';

const SyncAwarenessInnerLoggedIn = () => {
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
  const currentWorkspace = useService(WorkspaceService).workspace;

  useEffect(() => {
    if (account && currentWorkspace) {
      currentWorkspace.docCollection.awarenessStore.awareness.setLocalStateField(
        'user',
        {
          name: account.label,
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
  }, [currentWorkspace, account]);

  return null;
};

const SyncAwarenessInner = () => {
  const session = useService(AuthService).session;
  const loginStatus = useLiveData(session.status$);

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
