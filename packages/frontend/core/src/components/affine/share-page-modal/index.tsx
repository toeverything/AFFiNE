import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import type { Doc } from '@blocksuite/store';
import type { Workspace } from '@toeverything/infra';

import { ShareMenu } from './share-menu';

type SharePageModalProps = {
  workspace: Workspace;
  page: Doc;
  isJournal?: boolean;
};

export const SharePageButton = ({
  workspace,
  page,
  isJournal,
}: SharePageModalProps) => {
  const confirmEnableCloud = useEnableCloud();

  return (
    <ShareMenu
      isJournal={isJournal}
      workspaceMetadata={workspace.meta}
      currentPage={page}
      onEnableAffineCloud={() =>
        confirmEnableCloud(workspace, {
          openPageId: page.id,
        })
      }
    />
  );
};
