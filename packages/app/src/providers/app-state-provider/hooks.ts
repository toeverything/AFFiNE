import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from './context';

export const useLoadWorkspace = () => {
  const router = useRouter();
  const { loadWorkspace, currentWorkspace, currentWorkspaceId } = useAppState();

  const workspaceId = router.query.workspaceId as string;

  useEffect(() => {
    loadWorkspace?.(workspaceId);
  }, [loadWorkspace, workspaceId]);

  return currentWorkspaceId === workspaceId ? currentWorkspace : null;
};

export const useLoadPage = () => {
  const router = useRouter();
  const { loadPage, currentPage } = useAppState();
  const workspace = useLoadWorkspace();

  const pageId = router.query.pageId as string;

  useEffect(() => {
    loadPage(pageId);
  }, [workspace, pageId, loadPage]);

  return currentPage?.pageId === pageId ? currentPage : null;
};

export const useGoToPage = () => {
  const router = useRouter();
  const { currentWorkspaceId } = useAppState();

  return (pageId: string) => {
    router.push(`/workspace/${currentWorkspaceId}/${pageId}`);
  };
};
