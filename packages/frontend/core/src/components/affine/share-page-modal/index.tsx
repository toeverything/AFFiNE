import {
  type AffineOfficialWorkspace,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import type { Page } from '@blocksuite/store';
import { useCallback, useState } from 'react';

import { useOnTransformWorkspace } from '../../../hooks/root/use-on-transform-workspace';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import { ShareMenu } from './share-menu';

type SharePageModalProps = {
  workspace: AffineOfficialWorkspace;
  page: Page;
};

export const SharePageModal = ({ workspace, page }: SharePageModalProps) => {
  const onTransformWorkspace = useOnTransformWorkspace();
  const [open, setOpen] = useState(false);

  const handleConfirm = useCallback(() => {
    if (workspace.flavour !== WorkspaceFlavour.LOCAL) {
      return;
    }
    onTransformWorkspace(
      WorkspaceFlavour.LOCAL,
      WorkspaceFlavour.AFFINE_CLOUD,
      workspace
    );
    setOpen(false);
  }, [onTransformWorkspace, workspace]);

  return (
    <>
      <ShareMenu
        workspace={workspace}
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
