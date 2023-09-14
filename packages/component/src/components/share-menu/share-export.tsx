import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  ExportToHtmlMenuItem,
  ExportToMarkdownMenuItem,
  ExportToPdfMenuItem,
  ExportToPngMenuItem,
} from '../page-list/operation-menu-items/export';
import * as styles from './index.css';

export const ShareExport = () => {
  const t = useAFFiNEI18N();
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
      </div>
    </>
  );
};
