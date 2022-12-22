import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider/context';
import { useEffect, useState } from 'react';

export const useInitWorkspace = (disabled?: boolean) => {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const {
    workspacesMeta,
    loadWorkspace,
    currentWorkspace,
    currentWorkspaceId,
  } = useAppState();
  const workspaceId =
    (router.query.workspaceId as string) ||
    workspacesMeta?.[0]?.id ||
    new Date().getTime().toString();

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadWorkspace(workspaceId).finally(() => {
      setLoading(false);
    });
  }, [workspaceId, disabled]);

  return {
    workspaceId,
    workspace: workspaceId === currentWorkspaceId ? currentWorkspace : null,
    loading,
  };
};
