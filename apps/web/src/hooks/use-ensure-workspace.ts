import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useGlobalState } from '@/store/app';
// It is a fully effective hook
// Cause it not just ensure workspace loaded, but also have router change.
export const useEnsureWorkspace = () => {
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const dataCenter = useGlobalState(store => store.dataCenter);
  const { loadWorkspace } = useAppState();
  const router = useRouter();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    router.query.workspaceId as string
  );

  // const defaultOutLineWorkspaceId = '99ce7eb7';
  // console.log(defaultOutLineWorkspaceId);
  useEffect(() => {
    setWorkspaceLoaded(false);
    let aborted = false;
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

    loadWorkspace.current(workspaceId, abortController.signal).then(unit => {
      if (!aborted && unit) {
        setWorkspaceLoaded(true);
        setActiveWorkspaceId(workspaceId);
      }
    });

    return () => {
      aborted = true;
      abortController.abort();
    };
  }, [dataCenter, loadWorkspace, router]);

  return {
    workspaceLoaded,
    activeWorkspaceId,
  };
};

export default useEnsureWorkspace;
