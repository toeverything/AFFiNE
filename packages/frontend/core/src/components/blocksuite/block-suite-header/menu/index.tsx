import { toast } from '@affine/component';
import {
  Menu,
  MenuIcon,
  MenuItem,
  MenuSeparator,
} from '@affine/component/ui/menu';
import { currentModeAtom } from '@affine/core/atoms/mode';
import { PageHistoryModal } from '@affine/core/components/affine/page-history-modal';
import { Export, MoveToTrash } from '@affine/core/components/page-list';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useExportPage } from '@affine/core/hooks/affine/use-export-page';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
import { useService, Workspace } from '@toeverything/infra';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { HeaderDropDownButton } from '../../../pure/header-drop-down-button';
import { usePageHelper } from '../../block-suite-page-list/utils';
import { useFavorite } from '../favorite';

type PageMenuProps = {
  rename?: () => void;
  pageId: string;
  isJournal?: boolean;
};
// fixme: refactor this file
export const PageHeaderMenuButton = ({
  rename,
  pageId,
  isJournal,
}: PageMenuProps) => {
  const t = useAFFiNEI18N();

  const workspace = useService(Workspace);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const currentPage = blockSuiteWorkspace.getPage(pageId);
  assertExists(currentPage);

  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  const currentMode = useAtomValue(currentModeAtom);

  const { favorite, toggleFavorite } = useFavorite(pageId);

  const { togglePageMode, duplicate } =
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
      {!isJournal && (
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
      )}
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
        onSelect={toggleFavorite}
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
      {!isJournal && (
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
      )}
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
    </>
  );
};
