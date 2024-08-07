import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import { track } from '@affine/core/mixpanel';
import type { Doc } from '@blocksuite/store';
import { type Workspace } from '@toeverything/infra';
import { useCallback } from 'react';

import { ShareMenu } from './share-menu';

type SharePageModalProps = {
  workspace: Workspace;
  page: Doc;
};

export const SharePageButton = ({ workspace, page }: SharePageModalProps) => {
  const confirmEnableCloud = useEnableCloud();
  const handleOpenShareModal = useCallback((open: boolean) => {
    if (open) {
      track.$.sharePanel.$.open();
    }
  }, []);

  return (
    <ShareMenu
      workspaceMetadata={workspace.meta}
      currentPage={page}
      onEnableAffineCloud={() =>
        confirmEnableCloud(workspace, {
          openPageId: page.id,
        })
      }
      onOpenShareModal={handleOpenShareModal}
    />
  );
};
