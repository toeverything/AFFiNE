import { ShareMenu } from '@affine/component/share-menu';
import {
  type AffineOfficialWorkspace,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import type { Page } from '@blocksuite/store';
import { useCallback, useState } from 'react';

import { useExportPage } from '../../../hooks/affine/use-export-page';
import { useIsSharedPage } from '../../../hooks/affine/use-is-shared-page';
import { useOnTransformWorkspace } from '../../../hooks/root/use-on-transform-workspace';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';

type SharePageModalProps = {
  workspace: AffineOfficialWorkspace;
  page: Page;
};

export const SharePageModal = ({ workspace, page }: SharePageModalProps) => {
  const onTransformWorkspace = useOnTransformWorkspace();
  const [open, setOpen] = useState(false);
  const exportHandler = useExportPage(page);
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
        useIsSharedPage={useIsSharedPage}
        onEnableAffineCloud={() => setOpen(true)}
        togglePagePublic={async () => {}}
        exportHandler={exportHandler}
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
