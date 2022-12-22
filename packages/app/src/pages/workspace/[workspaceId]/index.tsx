import React, { ReactElement, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider/context';
import WorkspaceLayout from '@/components/workspace-layout';

const WorkspaceIndex = () => {
  const router = useRouter();
  const { createPage, currentWorkspaceId, currentWorkspace } = useAppState();

  useEffect(() => {
    const initPage = async () => {
      const savedPageId = currentWorkspace!.meta.pageMetas[0]?.id;
      if (savedPageId) {
        router.replace(`/workspace/${currentWorkspaceId}/${savedPageId}`);
        return;
      }

      const pageId = await createPage();
      router.replace(`/workspace/${currentWorkspaceId}/${pageId}`);
    };
    initPage();
  }, [currentWorkspace, currentWorkspaceId, createPage, router]);

  return <></>;
};

WorkspaceIndex.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceIndex;
