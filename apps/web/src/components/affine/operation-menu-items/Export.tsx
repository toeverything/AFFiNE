import { Menu, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
} from '@blocksuite/icons';

import type { CommonMenuItemProps } from './types';

export const Export = ({
  onSelect,
  onItemClick,
}: CommonMenuItemProps<{ type: 'markdown' | 'html' }>) => {
  const { t } = useTranslation();

  return (
    <Menu
      width={248}
      placement="left-start"
      trigger="click"
      content={
        <>
          <MenuItem
            onClick={() => {
              // @ts-expect-error
              globalThis.currentEditor.contentParser.onExportHtml();
              onSelect?.({ type: 'html' });
            }}
            icon={<ExportToHtmlIcon />}
          >
            {t('Export to HTML')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              // @ts-expect-error
              globalThis.currentEditor.contentParser.onExportMarkdown();
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
