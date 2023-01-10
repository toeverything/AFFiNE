import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';
import { useEffect, useRef, useState } from 'react';

export const useInitWorkspace = (disabled?: boolean) => {
  const [loading, setLoading] = useState(true);
  // Do not set as a constant, or it will trigger a hell of re-rendering
  const defaultOutLineWorkspaceId = useRef(new Date().getTime().toString());

  const router = useRouter();
  const { workspaceList, loadWorkspace, currentWorkspace, currentWorkspaceId } =
    useAppState();
  const workspaceId =
    (router.query.workspaceId as string) ||
    workspaceList?.[0]?.id ||
    defaultOutLineWorkspaceId.current;

  useEffect(() => {
    if (disabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadWorkspace(workspaceId).finally(() => {
      setLoading(false);
    });
  }, [workspaceId, disabled, loadWorkspace]);

  return {
    workspaceId,
    workspace: workspaceId === currentWorkspaceId ? currentWorkspace : null,
    loading,
  };
};
