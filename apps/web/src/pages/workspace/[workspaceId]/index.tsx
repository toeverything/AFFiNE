import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/router';
import { PageLoading } from '@/components/loading';
import usePageHelper from '@/hooks/use-page-helper';
import { useGlobalState } from '@/store/app';
import { assertExists } from '@blocksuite/global/utils';
import { WorkspaceSuspense } from '@/components/workspace-layout';

const WorkspaceIndex = () => {
  const router = useRouter();
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const { createPage } = usePageHelper();

  useEffect(() => {
    const initPage = async () => {
      const savedPageId =
        currentWorkspace?.blocksuiteWorkspace?.meta.pageMetas[0]?.id;
      if (savedPageId) {
        router.replace(`/workspace/${currentWorkspace.id}/${savedPageId}`);
        return;
      }
      assertExists(currentWorkspace);
      const pageId = await createPage();
      router.replace(`/workspace/${currentWorkspace.id}/${pageId}`);
    };
    initPage();
  }, [currentWorkspace, createPage, router]);

  return <PageLoading />;
};

export default function WorkspaceIndexWrapper() {
  return (
    <WorkspaceSuspense>
      <WorkspaceIndex />
    </WorkspaceSuspense>
  );
}
