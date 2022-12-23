import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider/context';
import useEnsureWorkspace from '@/hooks/use-ensure-workspace';
import { PageLoading } from '@/components/loading';

const WorkspaceIndex = () => {
  const router = useRouter();
  const { createPage, currentWorkspaceId, currentWorkspace } = useAppState();
  const { workspaceLoaded } = useEnsureWorkspace();

  useEffect(() => {
    const initPage = async () => {
      if (!workspaceLoaded) {
        return;
      }
      const savedPageId = currentWorkspace?.meta.pageMetas[0]?.id;
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
