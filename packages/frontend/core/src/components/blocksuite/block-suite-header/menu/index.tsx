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
import { useDetailPageHeaderResponsive } from '@affine/core/pages/workspace/detail-page/use-header-responsive';
import { mixpanel } from '@affine/core/utils';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import {
  DuplicateIcon,
  EdgelessIcon,
  EditIcon,
  FavoritedIcon,
  FavoriteIcon,
  HistoryIcon,
  ImportIcon,
  InformationIcon,
  PageIcon,
  ShareIcon,
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

  const { favorite, toggleFavorite } = useFavorite(pageId);

  const { duplicate } = useBlockSuiteMetaHelper(docCollection);
  const { importFile } = usePageHelper(docCollection);
  const { setTrashModal } = useTrashModalHelper(docCollection);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const setOpenHistoryTipsModal = useSetAtom(openHistoryTipsModalAtom);

  const openHistoryModal = useCallback(() => {
    if (workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      return setHistoryModalOpen(true);
    }
    return setOpenHistoryTipsModal(true);
  }, [setOpenHistoryTipsModal, workspace.flavour]);

  const setOpenInfoModal = useSetAtom(openInfoModalAtom);
  const openInfoModal = () => {
    setOpenInfoModal(true);
  };

  const handleOpenTrashModal = useCallback(() => {
    setTrashModal({
      open: true,
      pageIds: [pageId],
      pageTitles: [doc.meta$.value.title ?? ''],
    });
  }, [doc.meta$.value.title, pageId, setTrashModal]);

  const handleSwitchMode = useCallback(() => {
    doc.toggleMode();
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

  const exportHandler = useExportPage(doc.blockSuiteDoc);

  const handleDuplicate = useCallback(() => {
    duplicate(pageId);
    mixpanel.track('DocCreated', {
      segment: 'editor header',
      page: doc.mode$.value === 'page' ? 'doc editor' : 'edgeless editor',
      module: 'header menu',
      control: 'copy doc',
      type: 'doc duplicate',
      category: 'doc',
    });
  }, [doc.mode$.value, duplicate, pageId]);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    if (options.isWorkspaceFile) {
      mixpanel.track('WorkspaceCreated', {
        segment: 'editor header',
        page: doc.mode$.value === 'page' ? 'doc editor' : 'edgeless editor',
        module: 'header menu',
        control: 'import button',
        type: 'imported workspace',
      });
    } else {
      mixpanel.track('DocCreated', {
        segment: 'editor header',
        page: doc.mode$.value === 'page' ? 'doc editor' : 'edgeless editor',
        module: 'header menu',
        control: 'import button',
        type: 'imported doc',
      });
    }
  }, [doc.mode$.value, importFile]);

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
      {/* {TODO(@Peng): add tag function support} */}
      {/* <MenuItem
        icon={<TagsIcon />}
        data-testid="editor-option-menu-add-tag"
        onClick={() => {}}
        style={menuItemStyle}
      >
        {t['com.affine.header.option.add-tag']()}
      </MenuItem> */}
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
