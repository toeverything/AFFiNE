import { ExportMenuItems } from '@affine/component/page-list';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { LinkIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';

import { useExportPage } from '../../../../hooks/affine/use-export-page';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';
import { useSharingUrl } from './use-share-url';

export const ShareExport = ({ workspace, currentPage }: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  const workspaceId = workspace.id;
  const pageId = currentPage.id;
  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'workspace',
  });
  const exportHandler = useExportPage(currentPage);

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
            >
              {t['com.affine.share-menu.copy-private-link']()}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
};
