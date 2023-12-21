import { Export, FavoriteTag, MoveToTrash } from '@affine/component/page-list';
import {
  Menu,
  MenuIcon,
  MenuItem,
  MenuSeparator,
} from '@affine/component/ui/menu';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { waitForCurrentWorkspaceAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import {
  DuplicateIcon,
  EdgelessIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  HistoryIcon,
  ImportIcon,
  PageIcon,
} from '@blocksuite/icons';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { currentModeAtom } from '../../../atoms/mode';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useExportPage } from '../../../hooks/affine/use-export-page';
import { useTrashModalHelper } from '../../../hooks/affine/use-trash-modal-helper';
import { toast } from '../../../utils';
import { PageHistoryModal } from '../../affine/page-history-modal/history-modal';
import { HeaderDropDownButton } from '../../pure/header-drop-down-button';
import { usePageHelper } from '../block-suite-page-list/utils';

type PageMenuProps = {
  rename?: () => void;
  pageId: string;
};
// fixme: refactor this file
export const PageHeaderMenuButton = ({ rename, pageId }: PageMenuProps) => {
  const t = useAFFiNEI18N();

  // fixme(himself65): remove these hooks ASAP
  const workspace = useAtomValue(waitForCurrentWorkspaceAtom);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const currentPage = blockSuiteWorkspace.getPage(pageId);
  assertExists(currentPage);

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode = useAtomValue(currentModeAtom);
  const favorite = pageMeta?.favorite ?? false;

  const { togglePageMode, toggleFavorite, duplicate } =
    useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const { importFile } = usePageHelper(blockSuiteWorkspace);
  const { setTrashModal } = useTrashModalHelper(blockSuiteWorkspace);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const openHistoryModal = useCallback(() => {
    setHistoryModalOpen(true);
  }, []);

  const handleOpenTrashModal = useCallback(() => {
    if (!pageMeta) {
      return;
    }
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [pageMeta.title],
    });
  }, [pageId, pageMeta, setTrashModal]);

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

  const handleDuplicate = useCallback(() => {
    duplicate(pageId);
  }, [duplicate, pageId]);

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
      {/* {TODO: add tag function support} */}
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
        onSelect={handleDuplicate}
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
      <Export exportHandler={exportHandler} pageMode={currentMode} />

      {workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD &&
      runtimeConfig.enablePageHistory ? (
        <MenuItem
          preFix={
            <MenuIcon>
              <HistoryIcon />
            </MenuIcon>
          }
          data-testid="editor-option-menu-history"
          onSelect={openHistoryModal}
          style={menuItemStyle}
        >
          {t['com.affine.history.view-history-version']()}
        </MenuItem>
      ) : null}

      <MenuSeparator />
      <MoveToTrash
        data-testid="editor-option-menu-delete"
        onSelect={handleOpenTrashModal}
      />
    </>
  );
  if (pageMeta?.trash) {
    return null;
  }
  return (
    <>
      <Menu
        items={EditMenu}
        contentOptions={{
          align: 'center',
        }}
      >
        <HeaderDropDownButton />
      </Menu>
      {workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
        <PageHistoryModal
          workspace={workspace.blockSuiteWorkspace}
          open={historyModalOpen}
          pageId={pageId}
          onOpenChange={setHistoryModalOpen}
        />
      ) : null}
      <FavoriteTag active={!!pageMeta?.favorite} onClick={handleFavorite} />
    </>
  );
};
