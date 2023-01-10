import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';
import useEnsureWorkspace from '@/hooks/use-ensure-workspace';
import { PageLoading } from '@/components/loading';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const { currentWorkspaceId } = useAppState();
  const { workspaceLoaded } = useEnsureWorkspace();

  useEffect(() => {
    if (workspaceLoaded) {
      console.log('workspaceLoaded: ', workspaceLoaded);
      router.push(`/workspace/${currentWorkspaceId}`);
    }
  }, [currentWorkspaceId, router, workspaceLoaded]);

  return <PageLoading />;
};

export default WorkspaceIndex;
