import { useDataCenter, useDataCenterWorkspace } from '@affine/store';
import { useRouter } from 'next/router';
import { useMemo } from 'react';

export function useRouterTargetWorkspace() {
  const router = useRouter();
  const dataCenter = useDataCenter();
  const workspaceId =
    typeof router.query.workspaceId === 'string'
      ? router.query.workspaceId
      : dataCenter.workspaces.at(0)?.id ?? null;
  const targetWorkspace = useDataCenterWorkspace(workspaceId);
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
    targetWorkspace,
    exist: !notExist,
  };
}
