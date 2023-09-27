import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { LinkIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';

import {
  ExportToHtmlMenuItem,
  ExportToMarkdownMenuItem,
  ExportToPdfMenuItem,
  ExportToPngMenuItem,
} from '../page-list/operation-menu-items/export';
import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';
import { useSharingUrl } from './use-share-url';

export const ShareExport = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  const workspaceId = props.workspace.id;
  const pageId = props.currentPage.id;
  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId,
    urlType: 'workspace',
  });

  return (
    <>
      <div className={styles.titleContainerStyle} style={{ fontWeight: '500' }}>
        {t['com.affine.share-menu.ShareViaExport']()}
      </div>
      <div>
        <ExportToPdfMenuItem className={styles.menuItemStyle} />
        <ExportToHtmlMenuItem className={styles.menuItemStyle} />
        <ExportToPngMenuItem className={styles.menuItemStyle} />
        <ExportToMarkdownMenuItem className={styles.menuItemStyle} />
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.descriptionStyle}>
          {t['com.affine.share-menu.ShareViaExportDescription']()}
        </div>
        <Divider size="thinner" />
        <div>
          <Button
            className={styles.shareLinkStyle}
            onClick={onClickCopyLink}
            icon={<LinkIcon />}
            type="plain"
          >
            {t['Copy Link']()}
          </Button>
        </div>
      </div>
    </>
  );
};
