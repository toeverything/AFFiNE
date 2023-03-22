// fixme(himself65): refactor this file
import { Confirm, FlexWrapper, Menu, MenuItem } from '@affine/component';
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
import { EdgelessIcon, PageIcon } from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useTheme } from '@mui/material';
import { useAtom } from 'jotai';
import { useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { useCurrentPageId } from '../../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import {
  usePageMeta,
  usePageMetaHelper,
} from '../../../../hooks/use-page-meta';

export const EditorOptionMenu = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const [pageId] = useCurrentPageId();
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = usePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const [record, set] = useAtom(workspacePreferredModeAtom);
  const mode = record[pageId] ?? 'page';
  assertExists(pageMeta);
  const { favorite, trash } = pageMeta;
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [open, setOpen] = useState(false);

  const EditMenu = (
    <>
      <MenuItem
        data-testid="editor-option-menu-favorite"
        onClick={() => {
          setPageMeta(pageId, { favorite: !favorite });
          toast(
            favorite ? t('Removed from Favorites') : t('Added to Favorites')
          );
        }}
        iconSize={[20, 20]}
        icon={
          favorite ? (
            <FavoritedIcon style={{ color: theme.colors.primaryColor }} />
          ) : (
            <FavoriteIcon />
          )
        }
      >
        {favorite ? t('Remove from favorites') : t('Add to Favorites')}
      </MenuItem>
      <MenuItem
        icon={mode === 'page' ? <EdgelessIcon /> : <PageIcon />}
        iconSize={[20, 20]}
        data-testid="editor-option-menu-edgeless"
        onClick={() => {
          set(record => ({
            ...record,
            [pageId]: mode === 'page' ? 'edgeless' : 'page',
          }));
        }}
      >
        {t('Convert to ')}
        {mode === 'page' ? t('Edgeless') : t('Page')}
      </MenuItem>
      <Menu
        width={248}
        placement="left-start"
        content={
          <>
            <MenuItem
              onClick={() => {
                // @ts-expect-error
                globalThis.currentEditor.contentParser.onExportHtml();
              }}
              icon={<ExportToHtmlIcon />}
              iconSize={[20, 20]}
            >
              {t('Export to HTML')}
            </MenuItem>
            <MenuItem
              onClick={() => {
                // @ts-expect-error
                globalThis.currentEditor.contentParser.onExportMarkdown();
              }}
              icon={<ExportToMarkdownIcon />}
              iconSize={[20, 20]}
            >
              {t('Export to Markdown')}
            </MenuItem>
          </>
        }
      >
        <MenuItem icon={<ExportIcon />} iconSize={[20, 20]} isDir={true}>
          {t('Export')}
        </MenuItem>
      </Menu>
      <MenuItem
        data-testid="editor-option-menu-delete"
        onClick={() => {
          setOpen(true);
        }}
        icon={<DeleteTemporarilyIcon />}
        iconSize={[20, 20]}
      >
        {t('Delete')}
      </MenuItem>
    </>
  );

  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center">
        <Menu
          width={276}
          content={EditMenu}
          placement="bottom-end"
          disablePortal={true}
          trigger="click"
        >
          <IconButton data-testid="editor-option-menu" iconSize={[24, 24]}>
            <MoreVerticalIcon />
          </IconButton>
        </Menu>
      </FlexWrapper>
      <Confirm
        title={t('Delete page?')}
        content={t('will be moved to Trash', {
          title: pageMeta.title || 'Untitled',
        })}
        confirmText={t('Delete')}
        confirmType="danger"
        open={open}
        onConfirm={() => {
          toast(t('Moved to Trash'));
          setOpen(false);
          setPageMeta(pageId, { trash: !trash, trashDate: +new Date() });
        }}
        onClose={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </>
  );
};
