import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider/context';
import { useInitWorkspace } from '@/hooks/use-init-workspace';

const WorkspaceIndex = () => {
  const router = useRouter();
  const { createPage, currentWorkspaceId } = useAppState();
  const { workspace } = useInitWorkspace();

  useEffect(() => {
    const initPage = async () => {
      if (!workspace) {
        return;
      }
      const savedPageId = workspace.meta.pageMetas[0]?.id;
      if (savedPageId) {
        router.replace(`/workspace/${currentWorkspaceId}/${savedPageId}`);
        return;
      }

      const pageId = await createPage();
      router.replace(`/workspace/${currentWorkspaceId}/${pageId}`);
    };
    initPage();
  }, [workspace, currentWorkspaceId, createPage, router]);

  return <></>;
};

export default WorkspaceIndex;
