import { useRouter } from 'next/router';
import { useCallback, useEffect } from 'react';
import { useGlobalState } from '@/store/app';
import { assertEquals } from '@blocksuite/global/utils';

// todo: refactor with suspense mode
// It is a fully effective hook
// Cause it not just ensure workspace loaded, but also have router change.
export const useEnsureWorkspace = () => {
  const dataCenter = useGlobalState(useCallback(store => store.dataCenter, []));
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const loadWorkspace = useGlobalState(
    useCallback(store => store.loadWorkspace, [])
  );
  const router = useRouter();

  // const defaultOutLineWorkspaceId = '99ce7eb7';
  // console.log(defaultOutLineWorkspaceId);
  useEffect(() => {
    const abortController = new AbortController();

    const workspaceList = dataCenter.workspaces;
    const workspaceId =
      (router.query.workspaceId as string) || workspaceList[0]?.id;

    // If router.query.workspaceId is not in workspace list, jump to 404 page
    // If workspaceList is empty, we need to create a default workspace but not jump to 404
    if (
      workspaceId &&
      workspaceList.length &&
      workspaceList.findIndex(meta => meta.id.toString() === workspaceId) === -1
    ) {
      router.push('/404');
      return;
    }
    // If user is not login and input a custom workspaceId, jump to 404 page
    // if (
    //   !user &&
    //   router.query.workspaceId &&
    //   router.query.workspaceId !== defaultOutLineWorkspaceId
    // ) {
    //   router.push('/404');
    //   return;
    // }

    loadWorkspace(workspaceId, abortController.signal).then(unit => {
      if (!abortController.signal.aborted && unit) {
        assertEquals(unit.id, workspaceId);
      }
    });

    return () => {
      abortController.abort();
    };
  }, [dataCenter, loadWorkspace, router]);

  return {
    workspaceLoaded: currentWorkspace?.id === router.query.workspaceId,
    activeWorkspaceId: currentWorkspace?.id ?? router.query.workspaceId,
  };
};

export default useEnsureWorkspace;
