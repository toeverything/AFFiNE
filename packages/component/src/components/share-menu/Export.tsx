import { useTranslation } from '@affine/i18n';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import { ExportToHtmlIcon, ExportToMarkdownIcon } from '@blocksuite/icons';
import type { FC } from 'react';
import { useRef } from 'react';

import { Button } from '../..';
import {
  actionsStyle,
  descriptionStyle,
  exportButtonStyle,
  menuItemStyle,
  svgStyle,
} from './index.css';
import type { ShareMenuProps } from './ShareMenu';

export const Export: FC<ShareMenuProps> = props => {
  const contentParserRef = useRef<ContentParser>();
  const { t } = useTranslation();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t('Export Shared Pages Description')}
      </div>
      <div className={actionsStyle}>
        <Button
          className={exportButtonStyle}
          onClick={() => {
            if (!contentParserRef.current) {
              contentParserRef.current = new ContentParser(props.currentPage);
            }
            return contentParserRef.current.onExportHtml();
          }}
        >
          <ExportToHtmlIcon className={svgStyle} />
          {t('Export to HTML')}
        </Button>
        <Button
          className={exportButtonStyle}
          onClick={() => {
            if (!contentParserRef.current) {
              contentParserRef.current = new ContentParser(props.currentPage);
            }
            return contentParserRef.current.onExportMarkdown();
          }}
        >
          <ExportToMarkdownIcon className={svgStyle} />
          {t('Export to Markdown')}
        </Button>
      </div>
    </div>
  );
};
