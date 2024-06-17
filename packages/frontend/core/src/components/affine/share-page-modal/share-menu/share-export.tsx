import { MenuIcon, MenuItem } from '@affine/component';
import { Divider } from '@affine/component/ui/divider';
import { ExportMenuItems } from '@affine/core/components/page-list';
import { useExportPage } from '@affine/core/hooks/affine/use-export-page';
import { useSharingUrl } from '@affine/core/hooks/affine/use-share-url';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CopyIcon } from '@blocksuite/icons/rc';
import { DocService, useLiveData, useService } from '@toeverything/infra';

import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const ShareExport = ({
  workspaceMetadata: workspace,
  currentPage,
}: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  const doc = useService(DocService).doc;
  const workspaceId = workspace.id;
  const pageId = currentPage.id;
  const { sharingUrl, onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'workspace',
  });
  const exportHandler = useExportPage(currentPage);
  const currentMode = useLiveData(doc.mode$);
  const isMac = environment.isBrowser && environment.isMacOs;

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
            <MenuItem
              className={styles.shareLinkStyle}
              onSelect={onClickCopyLink}
              block
              disabled={!sharingUrl}
              preFix={
                <MenuIcon>
                  <CopyIcon fontSize={16} />
                </MenuIcon>
              }
              endFix={
                <div className={styles.shortcutStyle}>
                  {isMac ? '⌘ + ⌥ + C' : 'Ctrl + Shift + C'}
                </div>
              }
            >
              {t['com.affine.share-menu.copy-private-link']()}
            </MenuItem>
          </div>
        </div>
      ) : null}
    </>
  );
};
