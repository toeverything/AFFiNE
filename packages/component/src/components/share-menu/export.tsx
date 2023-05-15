import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
import type { ShareMenuProps } from './share-menu';

export const Export: FC<ShareMenuProps> = props => {
  const contentParserRef = useRef<ContentParser>();
  const t = useAFFiNEI18N();
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t['Export Shared Pages Description']()}
      </div>
      <div className={actionsStyle}>
        <Button
          className={exportButtonStyle}
          onClick={() => {
            if (!contentParserRef.current) {
              contentParserRef.current = new ContentParser(props.currentPage);
            }
            return contentParserRef.current.exportHtml();
          }}
        >
          <ExportToHtmlIcon className={svgStyle} />
          {t['Export to HTML']()}
        </Button>
        <Button
          className={exportButtonStyle}
          onClick={() => {
            if (!contentParserRef.current) {
              contentParserRef.current = new ContentParser(props.currentPage);
            }
            return contentParserRef.current.exportMarkdown();
          }}
        >
          <ExportToMarkdownIcon className={svgStyle} />
          {t['Export to Markdown']()}
        </Button>
      </div>
    </div>
  );
};
