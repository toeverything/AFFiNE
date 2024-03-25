import { Button } from '@affine/component/ui/button';
import { Divider } from '@affine/component/ui/divider';
import { ExportMenuItems } from '@affine/core/components/page-list';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { LinkIcon } from '@blocksuite/icons';
import { Doc, useLiveData, useService } from '@toeverything/infra';

import { useExportPage } from '../../../../hooks/affine/use-export-page';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';
import { useSharingUrl } from './use-share-url';

export const ShareExport = ({
  workspaceMetadata: workspace,
  currentPage,
}: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  const page = useService(Doc);
  const workspaceId = workspace.id;
  const pageId = currentPage.id;
  const { sharingUrl, onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'workspace',
  });
  const exportHandler = useExportPage(currentPage);
  const currentMode = useLiveData(page.mode$);

  return (
    <>
      <div className={styles.titleContainerStyle}>
        {t['com.affine.share-menu.ShareViaExport']()}
      </div>
      <div className={styles.descriptionStyle}>
        {t['com.affine.share-menu.ShareViaExportDescription']()}
      </div>
      <div>
        <ExportMenuItems
          exportHandler={exportHandler}
          className={styles.menuItemStyle}
          pageMode={currentMode}
        />
      </div>
      {workspace.flavour !== WorkspaceFlavour.LOCAL ? (
        <div className={styles.columnContainerStyle}>
          <Divider size="thinner" />
          <div className={styles.titleContainerStyle}>
            {t['com.affine.share-menu.share-privately']()}
          </div>
          <div className={styles.descriptionStyle}>
            {t['com.affine.share-menu.share-privately.description']()}
          </div>
          <div>
            <Button
              className={styles.shareLinkStyle}
              onClick={onClickCopyLink}
              icon={<LinkIcon />}
              type="plain"
              disabled={!sharingUrl}
            >
              {t['com.affine.share-menu.copy-private-link']()}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
};
