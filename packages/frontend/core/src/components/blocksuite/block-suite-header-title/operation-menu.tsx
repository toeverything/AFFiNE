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
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import {
  useBlockSuitePageMeta,
  usePageMetaHelper,
} from '@toeverything/hooks/use-block-suite-page-meta';
import { useBlockSuiteWorkspaceHelper } from '@toeverything/hooks/use-block-suite-workspace-helper';
import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import { setPageModeAtom } from '../../../atoms';
import { currentModeAtom } from '../../../atoms/mode';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useExportPage } from '../../../hooks/affine/use-export-page';
import { useTrashModalHelper } from '../../../hooks/affine/use-trash-modal-helper';
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
  const { openPage } = useNavigateHelper();

  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const currentPage = blockSuiteWorkspace.getPage(pageId);
  assertExists(currentPage);

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  ) as PageMeta;
  const currentMode = useAtomValue(currentModeAtom);
  const favorite = pageMeta.favorite ?? false;

  const { setPageMeta, setPageTitle } = usePageMetaHelper(blockSuiteWorkspace);
  const { togglePageMode, toggleFavorite } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { importFile } = usePageHelper(blockSuiteWorkspace);
  const { createPage } = useBlockSuiteWorkspaceHelper(blockSuiteWorkspace);
  const { setTrashModal } = useTrashModalHelper(blockSuiteWorkspace);

  const handleOpenTrashModal = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [pageMeta.title],
    });
  }, [pageId, pageMeta.title, setTrashModal]);

  const handleFavorite = useCallback(() => {
    toggleFavorite(pageId);
    toast(
      favorite
        ? t['com.affine.toastMessage.removedFavorites']()
        : t['com.affine.toastMessage.addedFavorites']()
    );
  }, [favorite, pageId, t, toggleFavorite]);
  const handleSwitchMode = useCallback(() => {
    togglePageMode(pageId);
    toast(
      currentMode === 'page'
        ? t['com.affine.toastMessage.edgelessMode']()
        : t['com.affine.toastMessage.pageMode']()
    );
  }, [currentMode, pageId, t, togglePageMode]);
  const menuItemStyle = {
    padding: '4px 12px',
    transition: 'all 0.3s',
  };

  const exportHandler = useExportPage(currentPage);
  const setPageMode = useSetAtom(setPageModeAtom);

  const duplicate = useAsyncCallback(async () => {
    const currentPageMeta = currentPage.meta;
    const newPage = createPage();
    await newPage.waitForLoaded();

    const update = encodeStateAsUpdate(currentPage.spaceDoc);
    applyUpdate(newPage.spaceDoc, update);

    setPageMeta(newPage.id, {
      tags: currentPageMeta.tags,
      favorite: currentPageMeta.favorite,
    });
    setPageMode(newPage.id, currentMode);
    setPageTitle(newPage.id, `${currentPageMeta.title}(1)`);
    openPage(blockSuiteWorkspace.id, newPage.id);
  }, [
    blockSuiteWorkspace.id,
    createPage,
    currentMode,
    currentPage.meta,
    currentPage.spaceDoc,
    openPage,
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
            {currentMode === 'page' ? <EdgelessIcon /> : <PageIcon />}
          </MenuIcon>
        }
        data-testid="editor-option-menu-edgeless"
        onSelect={handleSwitchMode}
        style={menuItemStyle}
      >
        {t['Convert to ']()}
        {currentMode === 'page'
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
      <Export exportHandler={exportHandler} />
      <MenuSeparator />
      <MoveToTrash
        data-testid="editor-option-menu-delete"
        onSelect={handleOpenTrashModal}
      />
    </>
  );
  if (pageMeta.trash) {
    return null;
  }
  return (
    <FlexWrapper alignItems="center" justifyContent="center" ref={ref}>
      <Menu
        items={EditMenu}
        contentOptions={{
          align: 'center',
        }}
      >
        <HeaderDropDownButton />
      </Menu>
    </FlexWrapper>
  );
};
