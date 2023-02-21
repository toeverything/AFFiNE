import { useGlobalStateApi } from '@affine/store';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';

import { PageLoading } from '@/components/loading';
import { useRouterTargetWorkspace } from '@/hooks/use-router-target-workspace';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const api = useGlobalStateApi();
  const { targetWorkspace, exist } = useRouterTargetWorkspace();
  const onceRef = useRef(true);
  useEffect(() => {
    if (!onceRef.current) {
      return;
    }
    onceRef.current = true;
    if (!exist) {
      router.push('/404');
    } else if (targetWorkspace) {
      api
        .getState()
        .loadWorkspace(targetWorkspace.id)
        .then(() => {
          router.push(`/workspace/${targetWorkspace.id}`);
        });
    }
  }, [targetWorkspace, exist, router, api]);
  return <PageLoading />;
};

export default WorkspaceIndex;
