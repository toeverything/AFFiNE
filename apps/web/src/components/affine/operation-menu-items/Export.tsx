import { Menu, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
} from '@blocksuite/icons';

export const Export = () => {
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
            }}
            icon={<ExportToHtmlIcon />}
          >
            {t('Export to HTML')}
          </MenuItem>
          <MenuItem
            onClick={() => {
              // @ts-expect-error
              globalThis.currentEditor.contentParser.onExportMarkdown();
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
        onClick={e => e.stopPropagation()}
      >
        {t('Export')}
      </MenuItem>
    </Menu>
  );
};
