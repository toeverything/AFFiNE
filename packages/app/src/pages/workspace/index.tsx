import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useInitWorkspace } from '@/hooks/use-init-workspace';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const { workspaceId, workspace } = useInitWorkspace();

  useEffect(() => {
    if (workspace) {
      router.push(`/workspace/${workspaceId}`);
    }
  }, [workspace, workspaceId]);

  return <></>;
};

export default WorkspaceIndex;
