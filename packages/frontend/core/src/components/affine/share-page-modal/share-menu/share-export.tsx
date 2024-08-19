import { ExportMenuItems } from '@affine/core/components/page-list';
import { useExportPage } from '@affine/core/hooks/affine/use-export-page';
import { EditorService } from '@affine/core/modules/editor';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './index.css';
import type { ShareMenuProps } from './share-menu';

export const ShareExport = ({ currentPage }: ShareMenuProps) => {
  const t = useI18n();
  const editor = useService(EditorService).editor;
  const exportHandler = useExportPage(currentPage);
  const currentMode = useLiveData(editor.mode$);

  return (
    <>
      <div className={styles.descriptionStyle}>
        {t['com.affine.share-menu.ShareViaExportDescription']()}
      </div>
      <div>
        <ExportMenuItems
          exportHandler={exportHandler}
          className={styles.exportItemStyle}
          pageMode={currentMode}
        />
      </div>
    </>
  );
};
