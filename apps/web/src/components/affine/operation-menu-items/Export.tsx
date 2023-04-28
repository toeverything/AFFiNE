import { Menu, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
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
  const { t } = useTranslation();
  const contentParserRef = useRef<ContentParser>();
  return (
    <Menu
      width={248}
      // placement="left-start"
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
              contentParserRef.current.onExportHtml();
              onSelect?.({ type: 'html' });
            }}
            icon={<ExportToHtmlIcon />}
          >
            {t('Export to HTML')}
          </MenuItem>
          <MenuItem
            data-testid="export-to-markdown"
            onClick={() => {
              if (!contentParserRef.current) {
                contentParserRef.current = new ContentParser(
                  globalThis.currentEditor!.page
                );
              }
              contentParserRef.current.onExportMarkdown();
              onSelect?.({ type: 'markdown' });
            }}
            icon={<ExportToMarkdownIcon />}
          >
            {t('Export to Markdown')}
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
        {t('Export')}
      </MenuItem>
    </Menu>
  );
};
