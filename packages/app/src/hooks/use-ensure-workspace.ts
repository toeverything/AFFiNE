import { useState, useEffect } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
const defaultOutLineWorkspaceId =
  'local-first-' + '85b4ca0b9081421d903bbc2501ea280f';
// It is a fully effective hook
// Cause it not just ensure workspace loaded, but also have router change.
export const useEnsureWorkspace = () => {
  const [workspaceLoaded, setWorkspaceLoaded] = useState(false);
  const { workspacesMeta, loadWorkspace, synced, user } = useAppState();
  const router = useRouter();

  // const defaultOutLineWorkspaceId = '99ce7eb7';
  // console.log(defaultOutLineWorkspaceId);
  useEffect(() => {
    if (!synced) {
      setWorkspaceLoaded(false);
      return;
    }
    // If router.query.workspaceId is not in workspace list, jump to 404 page
    // If workspacesMeta is empty, we need to create a default workspace but not jump to 404
    if (
      workspacesMeta.length &&
      router.query.workspaceId &&
      workspacesMeta.findIndex(
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

    const workspaceId = user
      ? (router.query.workspaceId as string) || workspacesMeta[0]?.id
      : (router.query.workspaceId as string) || defaultOutLineWorkspaceId;

    loadWorkspace(workspaceId).finally(() => {
      setWorkspaceLoaded(true);
    });
  }, [loadWorkspace, router, synced, user, workspacesMeta]);

  return {
    workspaceLoaded,
  };
};

export default useEnsureWorkspace;
