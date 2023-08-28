import { ShareMenu } from '@affine/component/share-menu';
import {
  type AffineOfficialWorkspace,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import type { Page } from '@blocksuite/store';
import { useState } from 'react';

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
  return (
    <>
      <ShareMenu
        workspace={workspace}
        currentPage={page}
        useIsSharedPage={useIsSharedPage}
        onEnableAffineCloud={() => setOpen(true)}
        togglePagePublic={async () => {}}
      />
      {workspace.flavour === WorkspaceFlavour.LOCAL ? (
        <EnableAffineCloudModal
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          onConfirm={() => {
            onTransformWorkspace(
              WorkspaceFlavour.LOCAL,
              WorkspaceFlavour.AFFINE_CLOUD,
              workspace
            );
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
};
