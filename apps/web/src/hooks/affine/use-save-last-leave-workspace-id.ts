import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { useCurrentWorkspace } from '../current/use-current-workspace';

const STORAGE_NAME = 'LAST_WORKSPACE_ID';
export function useSaveLastLeaveWorkspaceId() {
  const [workspace] = useCurrentWorkspace();
  const router = useRouter();

  const workspaceId = workspace?.id || null;

  useEffect(() => {
    const beforeUnloadHandler = () => {
      if (workspaceId) {
        localStorage.setItem(STORAGE_NAME, workspaceId);
      }
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, [workspaceId]);

  useEffect(() => {
    router.query.workspaceId &&
      localStorage.setItem(STORAGE_NAME, router.query.workspaceId as string);
  }, [router.query.workspaceId]);

  return {
    getSavedLastLeaveWorkspaceId: () => localStorage.getItem(STORAGE_NAME),
  };
}
