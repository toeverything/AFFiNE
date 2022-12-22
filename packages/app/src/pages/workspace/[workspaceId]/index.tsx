import React, { ReactElement, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider/context';
import { useLoadWorkspace } from '@/providers/app-state-provider/hooks';
import WorkspaceLayout from '@/components/workspace-layout';

const WorkspaceIndex = () => {
  const router = useRouter();
  const workspace = useLoadWorkspace();
  const { createPage, currentWorkspaceId } = useAppState();

  useEffect(() => {
    const initPage = async () => {
      if (!workspace) {
        return;
      }
      const savedPageId = workspace!.meta.pageMetas[0]?.id;
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

WorkspaceIndex.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceIndex;
