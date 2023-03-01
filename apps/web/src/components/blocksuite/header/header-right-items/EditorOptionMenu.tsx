// fixme(himself65): refactor this file
import { Menu, MenuItem } from '@affine/component';
import { IconButton } from '@affine/component';
import { toast } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  DeleteTemporarilyIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
} from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';

import { useCurrentPageId } from '../../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import {
  usePageMeta,
  usePageMetaHelper,
} from '../../../../hooks/use-page-meta';
import { EdgelessIcon, PaperIcon } from '../editor-mode-switch/Icons';

const PopoverContent = () => {
  const { t } = useTranslation();
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const [pageId] = useCurrentPageId();
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const { mode = 'page', favorite, trash } = pageMeta;
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  //

  return (
    <>
      <MenuItem
        data-testid="editor-option-menu-favorite"
        onClick={() => {
          setPageMeta(pageId, { favorite: !favorite });
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        icon={favorite ? <FavoritedIcon /> : <FavoriteIcon />}
      >
        {favorite ? t('Remove from favorites') : t('Add to Favorites')}
      </MenuItem>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PaperIcon />}
        data-testid="editor-option-menu-edgeless"
        onClick={() => {
          setPageMeta(pageId, {
            mode: mode === 'page' ? 'edgeless' : 'page',
          });
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
                // @ts-expect-error
                globalThis.editor.contentParser.onExportHtml();
              }}
              icon={<ExportToHtmlIcon />}
            >
              {t('Export to HTML')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                // @ts-expect-error
                globalThis.editor.contentParser.onExportMarkdown();
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
          // fixme(himself65): regression that don't have conform dialog
          setPageMeta(pageId, { trash: !trash });
          toast(t('Moved to Trash'));
        }}
        icon={<DeleteTemporarilyIcon />}
      >
        {t('Delete')}
      </MenuItem>
    </>
  );
};

export const EditorOptionMenu = () => {
  return (
    <Menu content={<PopoverContent />} placement="bottom-end" trigger="click">
      <IconButton data-testid="editor-option-menu">
        <MoreVerticalIcon />
      </IconButton>
    </Menu>
  );
};
