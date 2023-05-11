// fixme(himself65): refactor this file
import { FlexWrapper, IconButton, Menu, MenuItem } from '@affine/component';
import { Export, MoveToTrash } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  FavoritedIcon,
  FavoriteIcon,
  MoreVerticalIcon,
  PageIcon,
} from '@blocksuite/icons';
import { assertExists } from '@blocksuite/store';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtom } from 'jotai';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { workspacePreferredModeAtom } from '../../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentPageId } from '../../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { toast } from '../../../../utils';
import { MenuThemeModeSwitch } from '../header-right-items/theme-mode-switch';
import * as styles from '../styles.css';
import { LanguageMenu } from './language-menu';
const CommonMenu = () => {
  const content = (
    <div
      onClick={e => {
        e.stopPropagation();
      }}
    >
      <MenuThemeModeSwitch />
      <LanguageMenu />
    </div>
  );
  return (
    <FlexWrapper alignItems="center" justifyContent="center">
      <Menu
        width={276}
        content={content}
        placement="bottom"
        disablePortal={true}
        trigger="click"
      >
        <IconButton data-testid="editor-option-menu" iconSize={[24, 24]}>
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </FlexWrapper>
  );
};
const PageMenu = () => {
  const t = useAFFiNEI18N();
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const [pageId] = useCurrentPageId();
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const [record, set] = useAtom(workspacePreferredModeAtom);
  const mode = record[pageId] ?? 'page';

  const favorite = pageMeta.favorite ?? false;
  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [openConfirm, setOpenConfirm] = useState(false);
  const { removeToTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const EditMenu = (
    <>
      <>
        <MenuItem
          data-testid="editor-option-menu-favorite"
          onClick={() => {
            setPageMeta(pageId, { favorite: !favorite });
            toast(
              favorite
                ? t['Removed from Favorites']()
                : t['Added to Favorites']()
            );
          }}
          icon={
            favorite ? (
              <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
            ) : (
              <FavoriteIcon />
            )
          }
        >
          {favorite ? t['Remove from favorites']() : t['Add to Favorites']()}
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
          {t['Convert to ']()}
          {mode === 'page' ? t['Edgeless']() : t['Page']()}
        </MenuItem>
        <Export />
        {!pageMeta.isRootPinboard && (
          <MoveToTrash
            testId="editor-option-menu-delete"
            onItemClick={() => {
              setOpenConfirm(true);
            }}
          />
        )}
        <div className={styles.horizontalDividerContainer}>
          <div className={styles.horizontalDivider} />
        </div>
      </>

      <div
        onClick={e => {
          e.stopPropagation();
        }}
      >
        <MenuThemeModeSwitch />
        <LanguageMenu />
      </div>
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
          title={pageMeta.title}
          onConfirm={() => {
            removeToTrash(pageMeta.id);
            toast(t['Moved to Trash']());
            setOpenConfirm(false);
          }}
          onCancel={() => {
            setOpenConfirm(false);
          }}
        />
      </FlexWrapper>
    </>
  );
};
export const EditorOptionMenu = () => {
  const router = useRouter();
  return router.query.pageId ? <PageMenu /> : <CommonMenu />;
};
