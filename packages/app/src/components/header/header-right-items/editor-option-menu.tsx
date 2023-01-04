import { Menu, MenuItem } from '@/ui/menu';
import { IconButton } from '@/ui/button';
import {
  EdgelessIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  FavouritedIcon,
  FavouritesIcon,
  MoreVerticalIcon,
  PaperIcon,
  TrashIcon,
} from '@blocksuite/icons';
import { useAppState } from '@/providers/app-state-provider';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useConfirm } from '@/providers/confirm-provider';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import { toast } from '@/ui/toast';
import { useTranslation } from 'react-i18next';
const PopoverContent = () => {
  const { editor } = useAppState();
  const { toggleFavoritePage, toggleDeletePage } = usePageHelper();
  const { changePageMode } = usePageHelper();
  const { confirm } = useConfirm();
  const { t } = useTranslation();
  const {
    mode = 'page',
    id = '',
    favorite = false,
    title = '',
  } = useCurrentPageMeta() || {};

  return (
    <>
      <MenuItem
        data-testid="editor-option-menu-favorite"
        onClick={() => {
          toggleFavoritePage(id);
          toast(
            !favorite ? t('Removed to Favourites') : t('Added to Favourites')
          );
        }}
        icon={favorite ? <FavouritedIcon /> : <FavouritesIcon />}
      >
        {favorite ? t('Remove to favourites') : t('Add to favourites')}
      </MenuItem>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
        data-testid="editor-option-menu-edgeless"
        onClick={() => {
          changePageMode(id, mode === 'page' ? 'edgeless' : 'page');
        }}
      >
        {t('Convert to ')}
        {mode === 'page' ? t('Edgeless') : t('Page')}
      </MenuItem>
      <Menu
        placement="left-start"
        content={
          <>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportHtml();
              }}
              icon={<ExportToHtmlIcon />}
            >
              {t('Export to HTML')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                editor && editor.contentParser.onExportMarkdown();
              }}
              icon={<ExportToMarkdownIcon />}
            >
              {t('Export to Markdown')}
            </MenuItem>
          </>
        }
      >
        <MenuItem icon={<ExportIcon />} isDir={true}>
          {t('Export')}
        </MenuItem>
      </Menu>
      <MenuItem
        data-testid="editor-option-menu-delete"
        onClick={() => {
          confirm({
            title: t('Delete page?'),
            content: t('will be moved to Trash', {
              title: title || 'Untitled',
            }),
            confirmText: t('Delete'),
            confirmType: 'danger',
          }).then(confirm => {
            confirm && toggleDeletePage(id);
            confirm && toast(t('Moved to Trash'));
          });
        }}
        icon={<TrashIcon />}
      >
        {t('Delete')}
      </MenuItem>
    </>
  );
};

export const EditorOptionMenu = () => {
  return (
    <Menu content={<PopoverContent />} placement="bottom-end">
      <IconButton>
        <MoreVerticalIcon />
      </IconButton>
    </Menu>
  );
};

export default EditorOptionMenu;
