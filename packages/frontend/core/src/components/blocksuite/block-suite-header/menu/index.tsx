import { toast } from '@affine/component';
import {
  Menu,
  MenuIcon,
  MenuItem,
  MenuSeparator,
  MenuSub,
} from '@affine/component/ui/menu';
import {
  openHistoryTipsModalAtom,
  openInfoModalAtom,
} from '@affine/core/atoms';
import { PageHistoryModal } from '@affine/core/components/affine/page-history-modal';
import { ShareMenuContent } from '@affine/core/components/affine/share-page-modal/share-menu';
import { Export, MoveToTrash } from '@affine/core/components/page-list';
import { useBlockSuiteMetaHelper } from '@affine/core/hooks/affine/use-block-suite-meta-helper';
import { useEnableCloud } from '@affine/core/hooks/affine/use-enable-cloud';
import { useExportPage } from '@affine/core/hooks/affine/use-export-page';
import { useTrashModalHelper } from '@affine/core/hooks/affine/use-trash-modal-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { ViewService } from '@affine/core/modules/workbench/services/view';
import { useDetailPageHeaderResponsive } from '@affine/core/pages/workspace/detail-page/use-header-responsive';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import {
  DuplicateIcon,
  EdgelessIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  FrameIcon,
  HistoryIcon,
  ImportIcon,
  InformationIcon,
  OpenInNewIcon,
  PageIcon,
  ShareIcon,
  SplitViewIcon,
  TocIcon,
} from '@blocksuite/icons/rc';
import type { Doc } from '@blocksuite/store';
import {
  DocService,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { HeaderDropDownButton } from '../../../pure/header-drop-down-button';
import { usePageHelper } from '../../block-suite-page-list/utils';
import { useFavorite } from '../favorite';

type PageMenuProps = {
  rename?: () => void;
  page: Doc;
  isJournal?: boolean;
  containerWidth: number;
};
// fixme: refactor this file
export const PageHeaderMenuButton = ({
  rename,
  page,
  isJournal,
  containerWidth,
}: PageMenuProps) => {
  const pageId = page?.id;
  const t = useI18n();
  const { hideShare } = useDetailPageHeaderResponsive(containerWidth);
  const confirmEnableCloud = useEnableCloud();

  const workspace = useService(WorkspaceService).workspace;
  const docCollection = workspace.docCollection;

  const doc = useService(DocService).doc;
  const isInTrash = useLiveData(doc.meta$.map(m => m.trash));
  const currentMode = useLiveData(doc.mode$);

  const workbench = useService(WorkbenchService).workbench;

  const { favorite, toggleFavorite } = useFavorite(pageId);

  const { duplicate } = useBlockSuiteMetaHelper(docCollection);
  const { importFile } = usePageHelper(docCollection);
  const { setTrashModal } = useTrashModalHelper(docCollection);

  const view = useService(ViewService).view;

  const openSidePanel = useCallback(
    (id: string) => {
      workbench.openSidebar();
      view.activeSidebarTab(id);
    },
    [workbench, view]
  );

  const openAllFrames = useCallback(() => {
    openSidePanel('frame');
  }, [openSidePanel]);

  const openOutlinePanel = useCallback(() => {
    openSidePanel('outline');
  }, [openSidePanel]);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const setOpenHistoryTipsModal = useSetAtom(openHistoryTipsModalAtom);

  const openHistoryModal = useCallback(() => {
    track.$.header.history.open();
    if (workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      return setHistoryModalOpen(true);
    }
    return setOpenHistoryTipsModal(true);
  }, [setOpenHistoryTipsModal, workspace.flavour]);

  const setOpenInfoModal = useSetAtom(openInfoModalAtom);
  const openInfoModal = useCallback(() => {
    track.$.header.pageInfo.open();
    setOpenInfoModal(true);
  }, [setOpenInfoModal]);

  const handleOpenInNewTab = useCallback(() => {
    workbench.openDoc(pageId, {
      at: 'new-tab',
    });
  }, [pageId, workbench]);

  const handleOpenInSplitView = useCallback(() => {
    workbench.openDoc(pageId, {
      at: 'tail',
    });
  }, [pageId, workbench]);

  const handleOpenTrashModal = useCallback(() => {
    track.$.header.docOptions.deleteDoc();
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [doc.meta$.value.title ?? ''],
    });
  }, [doc.meta$.value.title, pageId, setTrashModal]);

  const handleRename = useCallback(() => {
    rename?.();
    track.$.header.docOptions.renameDoc();
  }, [rename]);

  const handleSwitchMode = useCallback(() => {
    doc.toggleMode();
    track.$.header.docOptions.switchPageMode({
      mode: currentMode === 'page' ? 'edgeless' : 'page',
    });
    toast(
      currentMode === 'page'
        ? t['com.affine.toastMessage.edgelessMode']()
        : t['com.affine.toastMessage.pageMode']()
    );
  }, [currentMode, doc, t]);
  const menuItemStyle = {
    padding: '4px 12px',
    transition: 'all 0.3s',
  };

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      track.$.header.docOptions.open();
    }
  }, []);

  const exportHandler = useExportPage(doc.blockSuiteDoc);

  const handleDuplicate = useCallback(() => {
    duplicate(pageId);
    track.$.header.docOptions.createDoc({
      control: 'duplicate',
    });
  }, [duplicate, pageId]);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    track.$.header.docOptions.import();
    if (options.isWorkspaceFile) {
      track.$.header.actions.createWorkspace({
        control: 'import',
      });
    } else {
      track.$.header.actions.createDoc({
        control: 'import',
      });
    }
  }, [importFile]);

  const handleShareMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      track.$.sharePanel.$.open();
    }
  }, []);

  const handleToggleFavorite = useCallback(() => {
    track.$.header.docOptions.toggleFavorite();
    toggleFavorite();
  }, [toggleFavorite]);

  const showResponsiveMenu = hideShare;
  const ResponsiveMenuItems = (
    <>
      {hideShare ? (
        <MenuSub
          subContentOptions={{
            sideOffset: 12,
            alignOffset: -8,
          }}
          items={
            <div style={{ padding: 4 }}>
              <ShareMenuContent
                workspaceMetadata={workspace.meta}
                currentPage={page}
                onEnableAffineCloud={() =>
                  confirmEnableCloud(workspace, {
                    openPageId: page.id,
                  })
                }
              />
            </div>
          }
          triggerOptions={{
            preFix: (
              <MenuIcon>
                <ShareIcon />
              </MenuIcon>
            ),
          }}
          subOptions={{
            onOpenChange: handleShareMenuOpenChange,
          }}
        >
          {t['com.affine.share-menu.shareButton']()}
        </MenuSub>
      ) : null}
      <MenuSeparator />
    </>
  );

  const EditMenu = (
    <>
      {showResponsiveMenu ? ResponsiveMenuItems : null}
      {!isJournal && (
        <MenuItem
          preFix={
            <MenuIcon>
              <EditIcon />
            </MenuIcon>
          }
          data-testid="editor-option-menu-rename"
          onSelect={handleRename}
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
        onSelect={handleToggleFavorite}
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
      <MenuSeparator />
      <MenuItem
        preFix={
          <MenuIcon>
            <OpenInNewIcon />
          </MenuIcon>
        }
        data-testid="editor-option-menu-open-in-new-tab"
        onSelect={handleOpenInNewTab}
        style={menuItemStyle}
      >
        {t['com.affine.workbench.tab.page-menu-open']()}
      </MenuItem>

      {environment.isDesktop && (
        <MenuItem
          preFix={
            <MenuIcon>
              <SplitViewIcon />
            </MenuIcon>
          }
          data-testid="editor-option-menu-open-in-split-new"
          onSelect={handleOpenInSplitView}
          style={menuItemStyle}
        >
          {t['com.affine.workbench.split-view.page-menu-open']()}
        </MenuItem>
      )}

      <MenuSeparator />

      {runtimeConfig.enableInfoModal && (
        <MenuItem
          preFix={
            <MenuIcon>
              <InformationIcon />
            </MenuIcon>
          }
          data-testid="editor-option-menu-info"
          onSelect={openInfoModal}
          style={menuItemStyle}
        >
          {t['com.affine.page-properties.page-info.view']()}
        </MenuItem>
      )}
      {currentMode === 'page' ? (
        <MenuItem
          preFix={
            <MenuIcon>
              <TocIcon />
            </MenuIcon>
          }
          data-testid="editor-option-toc"
          onSelect={openOutlinePanel}
          style={menuItemStyle}
        >
          {t['com.affine.header.option.view-toc']()}
        </MenuItem>
      ) : (
        <MenuItem
          preFix={
            <MenuIcon>
              <FrameIcon />
            </MenuIcon>
          }
          data-testid="editor-option-frame"
          onSelect={openAllFrames}
          style={menuItemStyle}
        >
          {t['com.affine.header.option.view-frame']()}
        </MenuItem>
      )}
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
        onSelect={onImportFile}
        style={menuItemStyle}
      >
        {t['Import']()}
      </MenuItem>
      <Export exportHandler={exportHandler} pageMode={currentMode} />
      <MenuSeparator />
      <MoveToTrash
        data-testid="editor-option-menu-delete"
        onSelect={handleOpenTrashModal}
      />
    </>
  );
  if (isInTrash) {
    return null;
  }
  return (
    <>
      <Menu
        items={EditMenu}
        contentOptions={{
          align: 'center',
        }}
        rootOptions={{
          onOpenChange: handleMenuOpenChange,
        }}
      >
        <HeaderDropDownButton />
      </Menu>
      {workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ? (
        <PageHistoryModal
          docCollection={workspace.docCollection}
          open={historyModalOpen}
          pageId={pageId}
          onOpenChange={setHistoryModalOpen}
        />
      ) : null}
    </>
  );
};
