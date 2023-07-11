import { WorkspaceFlavour } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { noop } from 'foxact/noop';
import { useAtomValue } from 'jotai';
import React, { useCallback } from 'react';

import { getUIAdapter } from '../../../adapters/workspace';
import {
  publicWorkspaceAtom,
  PublicWorkspaceLayout,
  publicWorkspacePageIdAtom,
} from '../../../layouts/public-workspace-layout';
import type { NextPageWithLayout } from '../../../shared';

const ShareDetailPage: NextPageWithLayout = () => {
  const workspace = useAtomValue(publicWorkspaceAtom);
  const pageId = useAtomValue(publicWorkspacePageIdAtom);
  assertExists(pageId);
  const { PageDetail } = getUIAdapter(WorkspaceFlavour.AFFINE_PUBLIC);
  return (
    <PageDetail
      currentWorkspaceId={workspace.id}
      currentPageId={pageId}
      onLoadEditor={useCallback(page => {
        page.awarenessStore.setReadonly(page, true);
        return noop;
      }, [])}
    />
  );
};

export default ShareDetailPage;

ShareDetailPage.getLayout = page => {
  return <PublicWorkspaceLayout>{page}</PublicWorkspaceLayout>;
};
