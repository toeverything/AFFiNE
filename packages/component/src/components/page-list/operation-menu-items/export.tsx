import { Menu, MenuItem } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
} from '@blocksuite/icons';
import { useRef } from 'react';

import type { CommonMenuItemProps } from './types';

export const Export = ({
  onSelect,
  onItemClick,
}: CommonMenuItemProps<{ type: 'markdown' | 'html' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  return (
    <Menu
      width={248}
      placement="left"
      trigger="click"
      content={
        <>
          <MenuItem
            data-testid="export-to-html"
            onClick={() => {
              if (!contentParserRef.current) {
                contentParserRef.current = new ContentParser(
                  globalThis.currentEditor!.page
                );
              }
              contentParserRef.current.exportHtml();
              onSelect?.({ type: 'html' });
            }}
            icon={<ExportToHtmlIcon />}
          >
            {t['Export to HTML']()}
          </MenuItem>
          <MenuItem
            data-testid="export-to-markdown"
            onClick={() => {
              if (!contentParserRef.current) {
                contentParserRef.current = new ContentParser(
                  globalThis.currentEditor!.page
                );
              }
              contentParserRef.current.exportMarkdown();
              onSelect?.({ type: 'markdown' });
            }}
            icon={<ExportToMarkdownIcon />}
          >
            {t['Export to Markdown']()}
          </MenuItem>
        </>
      }
    >
      <MenuItem
        data-testid="export-menu"
        icon={<ExportIcon />}
        endIcon={<ArrowRightSmallIcon />}
        onClick={e => {
          e.stopPropagation();
          onItemClick?.();
        }}
      >
        {t.Export()}
      </MenuItem>
    </Menu>
  );
};
