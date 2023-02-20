import { useDataCenter, useDataCenterWorkspace } from '@affine/store';
import { useRouter } from 'next/router';
import { useEffect, useMemo } from 'react';

import { PageLoading } from '@/components/loading';

// refactor(himself65): move this to top level hook
function useCurrentWorkspace() {
  const router = useRouter();
  const dataCenter = useDataCenter();
  const workspaceId =
    typeof router.query.workspaceId === 'string'
      ? router.query.workspaceId
      : dataCenter.workspaces.at(0)?.id ?? null;
  const currentWorkspace = useDataCenterWorkspace(workspaceId);
  const notExist = useMemo(
    () =>
      workspaceId &&
      dataCenter.workspaces.length &&
      dataCenter.workspaces.findIndex(
        meta => meta.id.toString() === workspaceId
      ) === -1,
    [dataCenter.workspaces, workspaceId]
  );
  return {
    currentWorkspace,
    exist: !notExist,
  };
}

export const WorkspaceIndex = () => {
  const router = useRouter();
  const { currentWorkspace, exist } = useCurrentWorkspace();
  useEffect(() => {
    if (!exist) {
      router.push('/404');
    } else if (currentWorkspace) {
      router.push(`/workspace/${currentWorkspace.id}`);
    }
  }, [currentWorkspace, exist, router]);
  return <PageLoading />;
};

export default WorkspaceIndex;
