// fixme(himself65): refactor this file
import { FlexWrapper, IconButton, Menu, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import {
  EdgelessIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  PageIcon,
} from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import { useTheme } from '@mui/material';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtom } from 'jotai';
import { useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentPageId } from '../../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { toast } from '../../../../utils';
import {
  Export,
  MoveTo,
  MoveToTrash,
} from '../../../affine/operation-menu-items';

export const EditorOptionMenu = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const [pageId] = useCurrentPageId();
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const allMetas = useBlockSuitePageMeta(blockSuiteWorkspace);
  const [record, set] = useAtom(workspacePreferredModeAtom);
  const mode = record[pageId] ?? 'page';
  assertExists(pageMeta);
  const { favorite } = pageMeta;
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [openConfirm, setOpenConfirm] = useState(false);
  const { removeToTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
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
      <Export />
      {!pageMeta.isRootPinboard && (
        <MoveTo
          metas={allMetas}
          currentMeta={pageMeta}
          blockSuiteWorkspace={blockSuiteWorkspace}
        />
      )}
      {!pageMeta.isRootPinboard && (
        <MoveToTrash
          testId="editor-option-menu-delete"
          onItemClick={() => {
            setOpenConfirm(true);
          }}
        />
      )}
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
        <MoveToTrash.ConfirmModal
          open={openConfirm}
          meta={pageMeta}
          onConfirm={() => {
            removeToTrash(pageMeta.id);
            toast(t('Moved to Trash'));
          }}
          onCancel={() => {
            setOpenConfirm(false);
          }}
        />
      </FlexWrapper>
    </>
  );
};
