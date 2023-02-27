import { useAtomValue, useSetAtom } from 'jotai';
import { useRouter } from 'next/router';
import React, { Suspense, useEffect } from 'react';

import {
  publicBlockSuiteAtom,
  publicWorkspaceIdAtom,
} from '../../../atoms/public-workspace';
import { QueryParamError } from '../../../components/affine/affine-error-eoundary';
import { PageDetailEditor } from '../../../components/page-detail-editor';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceLayout } from '../../../layouts';
import { NextPageWithLayout } from '../../../shared';

const PublicWorkspaceDetailPageInner: React.FC<{
  pageId: string;
}> = ({ pageId }) => {
  const blockSuiteWorkspace = useAtomValue(publicBlockSuiteAtom);
  if (!blockSuiteWorkspace) {
    throw new Error('blockSuiteWorkspace is null');
  }
  return (
    <PageDetailEditor
      pageId={pageId}
      blockSuiteWorkspace={blockSuiteWorkspace}
      onLoad={(_, editor) => {
        editor.readonly = true;
      }}
    />
  );
};

export const PublicWorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const pageId = router.query.pageId;
  const setWorkspaceId = useSetAtom(publicWorkspaceIdAtom);
  useEffect(() => {
    if (!router.isReady) {
      return;
    }
    if (typeof workspaceId === 'string') {
      setWorkspaceId(workspaceId);
    }
  }, [setWorkspaceId, workspaceId]);
  if (!router.isReady) {
    return <PageLoading />;
  }
  if (typeof workspaceId !== 'string' || typeof pageId !== 'string') {
    throw new QueryParamError('workspaceId, pageId', workspaceId);
  }
  return (
    <Suspense fallback={<PageLoading />}>
      <PublicWorkspaceDetailPageInner pageId={pageId} />
    </Suspense>
  );
};

export default PublicWorkspaceDetailPage;

PublicWorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
