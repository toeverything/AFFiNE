import { useCallback } from 'react';
import { useRouter } from 'next/router';
import { useGlobalState } from '@/store/app';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const dataCenter = useGlobalState(useCallback(store => store.dataCenter, []));

  let targetId: string;
  if (currentWorkspace) {
    targetId = currentWorkspace.id;
  } else if (
    typeof window !== 'undefined' &&
    !!localStorage.getItem('kCurrentDataCenterWorkspace')
  ) {
    // client side
    targetId = localStorage.getItem('kCurrentDataCenterWorkspace') as string;
  } else {
    targetId = dataCenter.workspaces[0].id;
  }

  // jump to `/workspace/${targetId}`
  throw router.push(`/workspace/${targetId}`);
};

export default WorkspaceIndex;
