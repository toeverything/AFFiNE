import { waitForCurrentWorkspaceAtom } from '@affine/core/modules/workspace';
import type { Page } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { Suspense, useEffect, useState } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../../hooks/affine/use-current-user';

export const useActiveUsers = () => {
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const [activeUsers, setActiveUsers] = useState<
    { user: { name: string; color: string }; page?: Page }[]
  >([]);

  useEffect(() => {
    function getAllBlockIdToPageId(): Record<string, Page> {
      const pages = [...currentWorkspace.blockSuiteWorkspace.pages.values()];
      const blocks = pages.flatMap(p =>
        Array.from(p.spaceDoc.getMap('blocks').keys()).map(k => [k, p])
      );
      return Object.fromEntries(blocks);
    }

    function getStates() {
      const blockId2pageId = getAllBlockIdToPageId();
      return Array.from(
        currentWorkspace.blockSuiteWorkspace.awarenessStore.getStates().values()
      ).map(s => {
        return {
          user: { name: s.user?.name ?? 'unnamed', color: s.color ?? 'black' },
          page:
            // @ts-expect-error todo: fix this
            currentWorkspace.blockSuiteWorkspace.getPage(s.page?.id) ??
            blockId2pageId[
              // @ts-expect-error todo: fix this
              s.selection?.[0]?.from?.blockId ?? s.selection?.[0]?.path?.[0]
            ] ??
            undefined,
        };
      });
    }

    if (currentWorkspace) {
      const awareness =
        currentWorkspace.blockSuiteWorkspace.awarenessStore.awareness;
      const onChange = () => {
        setActiveUsers(getStates());
      };
      onChange();
      awareness.on('change', onChange);
      return () => {
        awareness.off('change', onChange);
      };
    }
    return;
  }, [currentWorkspace]);

  return activeUsers;
};

const SyncAwarenessInnerLoggedIn = () => {
  const currentUser = useCurrentUser();
  const currentWorkspace = useAtomValue(waitForCurrentWorkspaceAtom);

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
