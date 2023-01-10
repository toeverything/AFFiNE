import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';
import useEnsureWorkspace from '@/hooks/use-ensure-workspace';
import { PageLoading } from '@/components/loading';
import usePageHelper from '@/hooks/use-page-helper';

const WorkspaceIndex = () => {
  const router = useRouter();
  const { currentWorkspaceId, currentWorkspace } = useAppState();
  const { createPage } = usePageHelper();
  const { workspaceLoaded } = useEnsureWorkspace();
  console.log('workspaceLoaded: ', workspaceLoaded);

  useEffect(() => {
    const initPage = async () => {
      if (!workspaceLoaded) {
        return;
      }
      const savedPageId = currentWorkspace?.meta.pageMetas[0]?.id;
      console.log('savedPageId: ', savedPageId);
      if (savedPageId) {
        router.replace(`/workspace/${currentWorkspaceId}/${savedPageId}`);
        return;
      }

      const pageId = await createPage();
      router.replace(`/workspace/${currentWorkspaceId}/${pageId}`);
    };
    initPage();
  }, [
    currentWorkspace,
    currentWorkspaceId,
    createPage,
    router,
    workspaceLoaded,
  ]);

  return <PageLoading />;
};

export default WorkspaceIndex;
