import {
  ExportToHtmlMenuItem,
  ExportToMarkdownMenuItem,
  ExportToPdfMenuItem,
  ExportToPngMenuItem,
} from '../page-list/operation-menu-items/export';
import * as styles from './index.css';
// import type { ShareMenuProps } from './share-menu';

export const ShareExport = () => {
  return (
    <>
      <div className={styles.titleContainerStyle} style={{ fontWeight: '500' }}>
        Share via Export
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
      <div className={styles.rowContainerStyle}>
        <div className={styles.descriptionStyle}>
          Download a static copy of your page to share with others.
        </div>
      </div>
    </>
  );
};
