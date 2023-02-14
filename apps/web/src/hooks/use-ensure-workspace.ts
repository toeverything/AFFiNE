import { useState, useEffect } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
// It is a fully effective hook
// Cause it not just ensure workspace loaded, but also have router change.
export const useEnsureWorkspace = () => {
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const { workspaceList, loadWorkspace, user } = useAppState();
  const router = useRouter();
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(
    router.query.workspaceId as string
  );

  // const defaultOutLineWorkspaceId = '99ce7eb7';
  // console.log(defaultOutLineWorkspaceId);
  useEffect(() => {
    // If router.query.workspaceId is not in workspace list, jump to 404 page
    // If workspaceList is empty, we need to create a default workspace but not jump to 404
    if (
      workspaceList.length &&
      // FIXME: router is not ready when this hook is called
      location.pathname.startsWith(`/workspace/${router.query.workspaceId}`) &&
      workspaceList.findIndex(
        meta => meta.id.toString() === router.query.workspaceId
      ) === -1
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
    const workspaceId =
      (router.query.workspaceId as string) || workspaceList[0]?.id;
    loadWorkspace.current(workspaceId).finally(() => {
      setWorkspaceLoaded(true);
      setActiveWorkspaceId(activeWorkspaceId);
    });
  }, [loadWorkspace, router, user, workspaceList, activeWorkspaceId]);

  return {
    workspaceLoaded,
    activeWorkspaceId,
  };
};

export default useEnsureWorkspace;
