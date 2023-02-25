import { assertExists } from '@blocksuite/store';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';

import { PageDetailEditor } from '../../../components/page-detail-editor';
import { PageLoading } from '../../../components/pure/loading';
import { WorkspaceLayout } from '../../../layouts';
import {
  BlockSuiteWorkspace,
  NextPageWithLayout,
  QueryKey,
} from '../../../shared';
import { createEmptyBlockSuiteWorkspace } from '../../../utils';

declare global {
  // eslint-disable-next-line no-var
  var blockSuiteWorkspace: BlockSuiteWorkspace;
}

export const PublicWorkspaceDetailPage: NextPageWithLayout = () => {
  const router = useRouter();
  const workspaceId = router.query.workspaceId;
  const pageId = router.query.pageId;
  const binary = useSWR([QueryKey.downloadWorkspace, workspaceId, true], {
    fallbackData: null,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const [ready, setReady] = useState(false);
  const [blockSuiteWorkspace, setBlockSuiteWorkspace] =
    useState<BlockSuiteWorkspace | null>(null);
  useEffect(() => {
    if (typeof workspaceId === 'string') {
      const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(workspaceId);
      globalThis.blockSuiteWorkspace = blockSuiteWorkspace;
      setBlockSuiteWorkspace(blockSuiteWorkspace);
    }
  }, [workspaceId]);
  useEffect(() => {
    if (!blockSuiteWorkspace) {
      return;
    }
    if (!binary.isLoading) {
      if (binary.data instanceof ArrayBuffer) {
        BlockSuiteWorkspace.Y.applyUpdate(
          blockSuiteWorkspace.doc,
          new Uint8Array(binary.data)
        );
        const dispose = blockSuiteWorkspace.signals.pageAdded.on(id => {
          if (id === pageId) {
            setTimeout(() => {
              setReady(true);
            });
          } else {
            setTimeout(() => {
              const page = blockSuiteWorkspace.getPage(id);
              assertExists(page);
              blockSuiteWorkspace.meta.awarenessStore.setReadonly(page, true);
            });
          }
        });
        return () => {
          dispose.dispose();
        };
      }
    }
  }, [binary.data, binary.isLoading, blockSuiteWorkspace, pageId]);
  if (!router.isReady || !blockSuiteWorkspace || !ready) {
    return <PageLoading />;
  }
  if (typeof workspaceId !== 'string' || typeof pageId !== 'string') {
    // todo: throw error
    return <div>not found router</div>;
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

export default PublicWorkspaceDetailPage;

PublicWorkspaceDetailPage.getLayout = page => {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
