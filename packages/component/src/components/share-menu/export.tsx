import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  ExportToHtmlMenuItem,
  ExportToMarkdownMenuItem,
  ExportToPdfMenuItem,
  ExportToPngMenuItem,
} from '../page-list/operation-menu-items/export';
import { actionsStyle, descriptionStyle, menuItemStyle } from './index.css';
// import type { ShareMenuProps } from './share-menu';

export const Export = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t['Export Shared Pages Description']()}
      </div>
      <div className={actionsStyle}>
        <ExportToPdfMenuItem />
        <ExportToHtmlMenuItem />
        <ExportToPngMenuItem />
        <ExportToMarkdownMenuItem />
      </div>
    </div>
  );
};
