import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { PageLoading } from '@/components/loading';
import { useRouterTargetWorkspace } from '@/hooks/use-router-target-workspace';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const { targetWorkspace, exist } = useRouterTargetWorkspace();
  useEffect(() => {
    if (!exist) {
      router.push('/404');
    } else if (targetWorkspace) {
      router.push(`/workspace/${targetWorkspace.id}`);
    }
  }, [targetWorkspace, exist, router]);
  return <PageLoading />;
};

export default WorkspaceIndex;
