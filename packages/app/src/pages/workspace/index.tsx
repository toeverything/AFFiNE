import React, { ReactElement, useEffect } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';

export const WorkspaceIndex = () => {
  const router = useRouter();
  const { currentWorkspaceId } = useAppState();
  useEffect(() => {
    if (currentWorkspaceId) {
      router.replace(`/workspace/${currentWorkspaceId}`);
    }
  }, [currentWorkspaceId, router]);
  return <></>;
};

WorkspaceIndex.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default WorkspaceIndex;
