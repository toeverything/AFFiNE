import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from './context';
import { usePageHelper } from '@/hooks/use-page-helper';
export const useLoadWorkspace = () => {
  const router = useRouter();
  const { loadWorkspace, currentWorkspace, currentWorkspaceId } = useAppState();

  const workspaceId = router.query.workspaceId as string;

  useEffect(() => {
    loadWorkspace?.(workspaceId);
  }, [workspaceId, loadWorkspace]);

  return currentWorkspaceId === workspaceId ? currentWorkspace : null;
};

export const useLoadPage = () => {
  const router = useRouter();
  const { loadPage, currentPage, currentWorkspaceId } = useAppState();
  const { createPage } = usePageHelper();
  const workspace = useLoadWorkspace();

  const pageId = router.query.pageId as string;

  useEffect(() => {
    if (!workspace) {
      return;
    }
    const page = pageId ? workspace?.getPage(pageId) : null;
    if (page) {
      loadPage?.(pageId);
      return;
    }

    const savedPageId = workspace.meta.pageMetas[0]?.id;
    if (savedPageId) {
      router.push(`/workspace/${currentWorkspaceId}/${savedPageId}`);
      return;
    }

    createPage().then(async pageId => {
      if (!pageId) {
        return;
      }
      router.push(`/workspace/${currentWorkspaceId}/${pageId}`);
    });
  }, [workspace, pageId, loadPage, createPage, router, currentWorkspaceId]);

  return currentPage?.id === pageId ? currentPage : null;
};
