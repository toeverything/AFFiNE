import { IconButton, MobileMenu } from '@affine/component';
import { SharePage } from '@affine/core/components/affine/share-page-modal/share-menu/share-page';
import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { ShareiOsIcon } from '@blocksuite/icons/rc';
import { DocService, useServices, WorkspaceService } from '@toeverything/infra';

import * as styles from './page-header-share-button.css';

export const PageHeaderShareButton = () => {
  const { workspaceService, docService } = useServices({
    WorkspaceService,
    DocService,
  });
  const workspace = workspaceService.workspace;
  const doc = docService.doc.blockSuiteDoc;
  const confirmEnableCloud = useEnableCloud();

  if (workspace.meta.flavour === WorkspaceFlavour.LOCAL) {
    return null;
  }

  return (
    <MobileMenu
      items={
        <div className={styles.content}>
          <SharePage
            workspaceMetadata={workspace.meta}
            currentPage={doc}
            onEnableAffineCloud={() =>
              confirmEnableCloud(workspace, {
                openPageId: doc.id,
              })
            }
          />
        </div>
      }
    >
      <IconButton size={24} style={{ padding: 10 }} icon={<ShareiOsIcon />} />
    </MobileMenu>
  );
};
