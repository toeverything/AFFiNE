import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { Workspace } from '@affine/workspace';
import { workspaceManagerAtom } from '@affine/workspace/atom';
import type { Page } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import { useState } from 'react';

import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import { ShareMenu } from './share-menu';

type SharePageModalProps = {
  workspace: Workspace;
  page: Page;
};

export const SharePageButton = ({ workspace, page }: SharePageModalProps) => {
  const [open, setOpen] = useState(false);

  const { openPage } = useNavigateHelper();

  const workspaceManager = useAtomValue(workspaceManagerAtom);

  const handleConfirm = useAsyncCallback(async () => {
    if (workspace.flavour !== WorkspaceFlavour.LOCAL) {
      return;
    }
    const { id: newId } =
      await workspaceManager.transformLocalToCloud(workspace);
    openPage(newId, page.id);
    setOpen(false);
  }, [openPage, page.id, workspace, workspaceManager]);

  return (
    <>
      <ShareMenu
        workspaceMetadata={workspace.meta}
        currentPage={page}
        onEnableAffineCloud={() => setOpen(true)}
      />
      {workspace.flavour === WorkspaceFlavour.LOCAL ? (
        <EnableAffineCloudModal
          open={open}
          onOpenChange={setOpen}
          onConfirm={handleConfirm}
        />
      ) : null}
    </>
  );
};
