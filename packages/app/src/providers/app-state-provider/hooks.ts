import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from './context';

export const useLoadWorkspace = () => {
  const router = useRouter();
  const { loadWorkspace, currentWorkspace, currentWorkspaceId } = useAppState();

  const workspaceId = router.query.workspaceId as string;

  useEffect(() => {
    loadWorkspace?.current?.(workspaceId);
  }, [workspaceId, loadWorkspace]);

  return currentWorkspaceId === workspaceId ? currentWorkspace : null;
};

export const useLoadPage = () => {
  const router = useRouter();
  const { loadPage, currentPage, createPage, currentWorkspaceId } =
    useAppState();
  const workspace = useLoadWorkspace();

  const pageId = router.query.pageId as string;

  useEffect(() => {
    if (!workspace) {
      return;
    }
    const page = pageId ? workspace?.getPage(pageId) : null;
    if (!page) {
      const savedPageId = workspace.meta.pageMetas[0]?.id;
      if (savedPageId) {
        router.push(`/workspace/${currentWorkspaceId}/${savedPageId}`);
        return;
      }

      createPage?.current?.()?.then(async pageId => {
        if (!pageId) {
          return;
        }
        router.push(`/workspace/${currentWorkspaceId}/${pageId}`);
      });
    }
    loadPage?.current?.(pageId);
  }, [workspace, pageId, loadPage, createPage, router, currentWorkspaceId]);

  return currentPage?.pageId === pageId ? currentPage : null;
};
