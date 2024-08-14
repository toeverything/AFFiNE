import { MenuIcon, MenuItem } from '@affine/component';
import { Divider } from '@affine/component/ui/divider';
import { ExportMenuItems } from '@affine/core/components/page-list';
import { useExportPage } from '@affine/core/hooks/affine/use-export-page';
import { useSharingUrl } from '@affine/core/hooks/affine/use-share-url';
import { EditorService } from '@affine/core/modules/editor';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { CopyIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const ShareExport = ({
  workspaceMetadata: workspace,
  currentPage,
}: ShareMenuProps) => {
  const t = useI18n();
  const editor = useService(EditorService).editor;
  const workspaceId = workspace.id;
  const pageId = currentPage.id;
  const { sharingUrl, onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'workspace',
  });
  const exportHandler = useExportPage(currentPage);
  const currentMode = useLiveData(editor.mode$);
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
