import { useGlobalState } from '@affine/store';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { PageLoading } from '@/components/loading';
import usePageHelper from '@/hooks/use-page-helper';
import { useRouterTargetWorkspace } from '@/hooks/use-router-target-workspace';

const WorkspaceIndex = () => {
  const router = useRouter();
  const { targetWorkspace, exist } = useRouterTargetWorkspace();
  const loadWorkspace = useGlobalState(store => store.loadWorkspace);
  const { createPage } = usePageHelper();

  useEffect(() => {
    if (!exist) {
      router.push('/404');
      return;
    }
    const abortController = new AbortController();
    const initPage = async () => {
      if (abortController.signal.aborted) {
        return;
      }
      if (!targetWorkspace) {
        return;
      }
      const savedPageId =
        targetWorkspace.blocksuiteWorkspace?.meta.pageMetas.find(
          meta => !meta.trash
        )?.id;
      if (savedPageId) {
        await loadWorkspace(targetWorkspace.id);
        router.replace(`/workspace/${targetWorkspace.id}/${savedPageId}`);
        return;
      } else {
        await loadWorkspace(targetWorkspace.id);
        const pageId = await createPage();
        if (abortController.signal.aborted) {
          return;
        }
        router.replace(`/workspace/${targetWorkspace.id}/${pageId}`);
      }
    };
    initPage();
    return () => {
      abortController.abort();
    };
  }, [targetWorkspace, createPage, router, exist, loadWorkspace]);

  return <PageLoading />;
};

export default WorkspaceIndex;
