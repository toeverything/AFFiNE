import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  ExportToHtmlMenuItem,
  ExportToMarkdownMenuItem,
  ExportToPdfMenuItem,
  ExportToPngMenuItem,
} from '../page-list/operation-menu-items/export';
import * as styles from './index.css';
// import type { ShareMenuProps } from './share-menu';

export const ShareExport = () => {
  const t = useAFFiNEI18N();
  return (
    <>
      <div className={styles.titleContainerStyle} style={{ fontWeight: '500' }}>
        {t['com.affine.share-menu.ShareViaExport']()}
      </div>
      <div>
        <ExportToPdfMenuItem
          style={{ padding: '4px' }}
          iconSize={16}
          gap={'4px'}
        />
        <ExportToHtmlMenuItem
          style={{ padding: '4px' }}
          iconSize={16}
          gap={'4px'}
        />
        <ExportToPngMenuItem
          style={{ padding: '4px' }}
          iconSize={16}
          gap={'4px'}
        />
        <ExportToMarkdownMenuItem
          style={{ padding: '4px' }}
          iconSize={16}
          gap={'4px'}
        />
      </div>
      <div className={styles.columnContainerStyle}>
        <div className={styles.descriptionStyle}>
          {t['com.affine.share-menu.ShareViaExportDescription']()}
        </div>
      </div>
    </>
  );
};
