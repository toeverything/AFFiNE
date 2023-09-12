import { FlexWrapper } from '@affine/component';
import { Export, MoveToTrash } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import {
  DuplicateIcon,
  EdgelessIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  ImportIcon,
  PageIcon,
} from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import {
  Menu,
  MenuIcon,
  MenuItem,
  MenuSeparator,
} from '@toeverything/components/menu';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useAtom, useSetAtom } from 'jotai';
import { useCallback, useRef, useState } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { pageSettingFamily, setPageModeAtom } from '../../../atoms';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { toast } from '../../../utils';
import { HeaderDropDownButton } from '../../pure/header-drop-down-button';
import { usePageHelper } from '../block-suite-page-list/utils';

type PageMenuProps = {
  rename?: () => void;
  pageId: string;
};
// fixme: refactor this file
export const PageMenu = ({ rename, pageId }: PageMenuProps) => {
  const t = useAFFiNEI18N();
  const ref = useRef(null);
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();

  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  ) as PageMeta;
  const [setting, setSetting] = useAtom(pageSettingFamily(pageId));
  const mode = setting?.mode ?? 'page';

  const favorite = pageMeta.favorite ?? false;
  const { setPageMeta, setPageTitle } = usePageMetaHelper(blockSuiteWorkspace);
  const [openConfirm, setOpenConfirm] = useState(false);
  const { removeToTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { importFile } = usePageHelper(blockSuiteWorkspace);
  const handleFavorite = useCallback(() => {
    setPageMeta(pageId, { favorite: !favorite });
    toast(
      favorite
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favorite, pageId, setPageMeta, t]);
  const handleSwitchMode = useCallback(() => {
    setSetting(setting => ({
      mode: setting?.mode === 'page' ? 'edgeless' : 'page',
    }));
    toast(
      mode === 'page'
        ? t['com.affine.toastMessage.edgelessMode']()
        : t['com.affine.toastMessage.pageMode']()
    );
  }, [mode, setSetting, t]);
  const handleOnConfirm = useCallback(() => {
    removeToTrash(pageId);
    toast(t['com.affine.toastMessage.movedTrash']());
    setOpenConfirm(false);
  }, [pageId, removeToTrash, t]);
  const menuItemStyle = {
    padding: '4px 12px',
    transition: 'all 0.3s',
  };
  const { openPage } = useNavigateHelper();
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const setPageMode = useSetAtom(setPageModeAtom);
  const duplicate = useCallback(async () => {
    const currentPage = blockSuiteWorkspace.getPage(pageId);
    assertExists(currentPage);
    const currentPageMeta = currentPage.meta;
    const newPage = createPage();
    await newPage.waitForLoaded();
    const update = encodeStateAsUpdate(currentPage.spaceDoc);
    applyUpdate(newPage.spaceDoc, update);
    setPageMeta(newPage.id, {
      tags: currentPageMeta.tags,
      favorite: currentPageMeta.favorite,
    });
    setPageMode(newPage.id, mode);
    setPageTitle(newPage.id, `${currentPageMeta.title}(1)`);
    openPage(blockSuiteWorkspace.id, newPage.id);
  }, [
    blockSuiteWorkspace,
    createPage,
    mode,
    openPage,
    pageId,
    setPageMeta,
    setPageMode,
    setPageTitle,
  ]);
  const EditMenu = (
    <>
      <MenuItem
        preFix={
          <MenuIcon>
            <EditIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-rename"
        onSelect={rename}
        style={menuItemStyle}
      >
        {t['Rename']()}
      </MenuItem>
      <MenuItem
        preFix={
          <MenuIcon>
            {mode === 'page' ? <EdgelessIcon /> : <PageIcon />}
          </MenuIcon>
        }
        data-testid="editor-option-menu-edgeless"
        onSelect={handleSwitchMode}
        style={menuItemStyle}
      >
        {t['com.affine.pageMode.convertTo']()}
        {mode === 'page'
          ? t['com.affine.pageMode.edgeless']()
          : t['com.affine.pageMode.page']()}
      </MenuItem>
      <MenuItem
        data-testid="editor-option-menu-favorite"
        onSelect={handleFavorite}
        style={menuItemStyle}
        preFix={
          <MenuIcon>
            {favorite ? (
              <FavoritedIcon style={{ color: 'var(--affine-primary-color)' }} />
            ) : (
              <FavoriteIcon />
            )}
          </MenuIcon>
        }
      >
        {favorite
          ? t['com.affine.favoritePageOperation.remove']()
          : t['com.affine.favoritePageOperation.add']()}
      </MenuItem>
      {/* {TODO: add tag and duplicate function support} */}
      {/* <MenuItem
        icon={<TagsIcon />}
        data-testid="editor-option-menu-add-tag"
        onClick={() => {}}
        style={menuItemStyle}
      >
        {t['com.affine.header.option.add-tag']()}
      </MenuItem> */}
      <MenuSeparator />
      <MenuItem
        preFix={
          <MenuIcon>
            <DuplicateIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-duplicate"
        onSelect={duplicate}
        style={menuItemStyle}
      >
        {t['com.affine.header.option.duplicate']()}
      </MenuItem>
      <MenuItem
        preFix={
          <MenuIcon>
            <ImportIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-import"
        onSelect={importFile}
        style={menuItemStyle}
      >
        {t['Import']()}
      </MenuItem>
      <Export />
      <MenuSeparator />
      <MoveToTrash
        data-testid="editor-option-menu-delete"
        onSelect={() => {
          setOpenConfirm(true);
        }}
      />
    </>
  );
  if (pageMeta.trash) {
    return null;
  }
  return (
    <>
      <FlexWrapper alignItems="center" justifyContent="center" ref={ref}>
        <Menu
          items={EditMenu}
          portalOptions={{
            container: ref.current,
          }}
          contentOptions={{
            align: 'center',
          }}
        >
          <HeaderDropDownButton />
        </Menu>
        <MoveToTrash.ConfirmModal
          open={openConfirm}
          title={pageMeta.title}
          onConfirm={handleOnConfirm}
          onCancel={() => {
            setOpenConfirm(false);
          }}
        />
      </FlexWrapper>
    </>
  );
};
