import { useExportPage } from '@affine/core/components/hooks/affine/use-export-page';
import { ExportMenuItems } from '@affine/core/components/page-list';
import { useI18n } from '@affine/i18n';

import * as styles from './index.css';

export const ShareExport = () => {
  const t = useI18n();
  const exportHandler = useExportPage();

  return (
    <div className={styles.exportContainerStyle}>
      <div className={styles.descriptionStyle}>
        {t['com.affine.share-menu.ShareViaExportDescription']()}
      </div>
      <div className={styles.exportContainerStyle}>
        <ExportMenuItems
          exportHandler={exportHandler}
          className={styles.exportItemStyle}
        />
      </div>
    </div>
  );
};
