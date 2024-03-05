import { AnimatedDeleteIcon } from '@affine/component';
import { Menu } from '@affine/component/ui/menu';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { CollectionService } from '@affine/core/modules/collection';
import { apis, events } from '@affine/electron-api';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FolderIcon, SettingsIcon } from '@blocksuite/icons';
import { type Doc } from '@blocksuite/store';
import { useDroppable } from '@dnd-kit/core';
import { useLiveData, useService, type Workspace } from '@toeverything/infra';
import { useAtom, useAtomValue } from 'jotai';
import { nanoid } from 'nanoid';
import type { HTMLAttributes, ReactElement } from 'react';
import { forwardRef, Suspense, useCallback, useEffect } from 'react';

import { openWorkspaceListModalAtom } from '../../atoms';
import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import { useDeleteCollectionInfo } from '../../hooks/affine/use-delete-collection-info';
import { getDropItemId } from '../../hooks/affine/use-sidebar-drag';
import { useTrashModalHelper } from '../../hooks/affine/use-trash-modal-helper';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { Workbench } from '../../modules/workbench';
import {
  AddPageButton,
  AppDownloadButton,
  AppSidebar,
  appSidebarOpenAtom,
  CategoryDivider,
  MenuItem,
  MenuLinkItem,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
} from '../app-sidebar';
import {
  createEmptyCollection,
  MoveToTrash,
  useEditCollectionName,
} from '../page-list';
import { CollectionsList } from '../pure/workspace-slider-bar/collections';
import { AddCollectionButton } from '../pure/workspace-slider-bar/collections/add-collection-button';
import { AddFavouriteButton } from '../pure/workspace-slider-bar/favorite/add-favourite-button';
import FavoriteList from '../pure/workspace-slider-bar/favorite/favorite-list';
import { UserWithWorkspaceList } from '../pure/workspace-slider-bar/user-with-workspace-list';
import { WorkspaceCard } from '../pure/workspace-slider-bar/workspace-card';
import ImportPage from './import-page';
import { AppSidebarJournalButton } from './journal-button';
import { UpdaterButton } from './updater-button';

export type RootAppSidebarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenSettingModal: () => void;
  currentWorkspace: Workspace;
  openPage: (pageId: string) => void;
  createPage: () => Doc;
  paths: {
    all: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    shared: (workspaceId: string) => string;
  };
};

const RouteMenuLinkItem = forwardRef<
  HTMLDivElement,
  {
    path: string;
    icon: ReactElement;
    active?: boolean;
    children?: ReactElement;
  } & HTMLAttributes<HTMLDivElement>
>(({ path, icon, active, children, ...props }, ref) => {
  return (
    <MenuLinkItem
      ref={ref}
      {...props}
      active={active}
      to={path ?? ''}
      icon={icon}
    >
      {children}
    </MenuLinkItem>
  );
});
RouteMenuLinkItem.displayName = 'RouteMenuLinkItem';

/**
 * This is for the whole affine app sidebar.
 * This component wraps the app sidebar in `@affine/component` with logic and data.
 *
 * @todo(himself65): rewrite all styled component into @vanilla-extract/css
 */
export const RootAppSidebar = ({
  currentWorkspace,
  openPage,
  createPage,
  paths,
  onOpenQuickSearchModal,
  onOpenSettingModal,
}: RootAppSidebarProps): ReactElement => {
  const currentWorkspaceId = currentWorkspace.id;
  const { appSettings } = useAppSettingHelper();
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  const t = useAFFiNEI18N();
  const [openUserWorkspaceList, setOpenUserWorkspaceList] = useAtom(
    openWorkspaceListModalAtom
  );
  const currentPath = useLiveData(useService(Workbench).location).pathname;

  const onClickNewPage = useAsyncCallback(async () => {
    const page = createPage();
    page.load();
    openPage(page.id);
  }, [createPage, openPage]);

  const { trashModal, setTrashModal, handleOnConfirm } =
    useTrashModalHelper(blockSuiteWorkspace);
  const deletePageTitles = trashModal.pageTitles;
  const trashConfirmOpen = trashModal.open;
  const onTrashConfirmOpenChange = useCallback(
    (open: boolean) => {
      setTrashModal({
        ...trashModal,
        open,
      });
    },
    [trashModal, setTrashModal]
  );

  const navigateHelper = useNavigateHelper();
  // Listen to the "New Page" action from the menu
  useEffect(() => {
    if (environment.isDesktop) {
      return events?.applicationMenu.onNewPageAction(onClickNewPage);
    }
    return;
  }, [onClickNewPage]);

  const sidebarOpen = useAtomValue(appSidebarOpenAtom);
  useEffect(() => {
    if (environment.isDesktop) {
      apis?.ui.handleSidebarVisibilityChange(sidebarOpen).catch(err => {
        console.error(err);
      });
    }
  }, [sidebarOpen]);

  const dropItemId = getDropItemId('trash');
  const trashDroppable = useDroppable({
    id: dropItemId,
  });
  const closeUserWorkspaceList = useCallback(() => {
    setOpenUserWorkspaceList(false);
  }, [setOpenUserWorkspaceList]);
  const userInfo = useDeleteCollectionInfo();

  const collection = useService(CollectionService);
  const { node, open } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });
  const handleCreateCollection = useCallback(() => {
    open('')
      .then(name => {
        const id = nanoid();
        collection.addCollection(createEmptyCollection(id, { name }));
        navigateHelper.jumpToCollection(blockSuiteWorkspace.id, id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [blockSuiteWorkspace.id, collection, navigateHelper, open]);

  const allPageActive = currentPath === '/all';

  const trashActive = currentPath === '/trash';

  return (
    <AppSidebar
      hasBackground={
        !(
          appSettings.enableBlurBackground &&
          environment.isDesktop &&
          environment.isMacOs
        )
      }
    >
      <MoveToTrash.ConfirmModal
        open={trashConfirmOpen}
        onConfirm={handleOnConfirm}
        onOpenChange={onTrashConfirmOpenChange}
        titles={deletePageTitles}
      />
      <SidebarContainer>
        <Menu
          rootOptions={{
            open: openUserWorkspaceList,
          }}
          items={
            <Suspense>
              <UserWithWorkspaceList onEventEnd={closeUserWorkspaceList} />
            </Suspense>
          }
          contentOptions={{
            // hide trigger
            sideOffset: -58,
            onInteractOutside: closeUserWorkspaceList,
            onEscapeKeyDown: closeUserWorkspaceList,
            style: {
              width: '300px',
            },
          }}
        >
          <WorkspaceCard
            onClick={useCallback(() => {
              setOpenUserWorkspaceList(true);
            }, [setOpenUserWorkspaceList])}
          />
        </Menu>
        <QuickSearchInput
          data-testid="slider-bar-quick-search-button"
          onClick={onOpenQuickSearchModal}
        />
        <RouteMenuLinkItem
          icon={<FolderIcon />}
          active={allPageActive}
          path={paths.all(currentWorkspaceId)}
        >
          <span data-testid="all-pages">
            {t['com.affine.workspaceSubPath.all']()}
          </span>
        </RouteMenuLinkItem>
        <AppSidebarJournalButton
          workspace={currentWorkspace.blockSuiteWorkspace}
        />
        {runtimeConfig.enableNewSettingModal ? (
          <MenuItem
            data-testid="slider-bar-workspace-setting-button"
            icon={<SettingsIcon />}
            onClick={onOpenSettingModal}
          >
            <span data-testid="settings-modal-trigger">
              {t['com.affine.settingSidebar.title']()}
            </span>
          </MenuItem>
        ) : null}
      </SidebarContainer>

      <SidebarScrollableContainer>
        <CategoryDivider label={t['com.affine.rootAppSidebar.favorites']()}>
          <AddFavouriteButton workspace={blockSuiteWorkspace} />
        </CategoryDivider>
        <FavoriteList workspace={blockSuiteWorkspace} />
        <CategoryDivider label={t['com.affine.rootAppSidebar.collections']()}>
          <AddCollectionButton node={node} onClick={handleCreateCollection} />
        </CategoryDivider>
        <CollectionsList
          workspace={blockSuiteWorkspace}
          info={userInfo}
          onCreate={handleCreateCollection}
        />
        <CategoryDivider label={t['com.affine.rootAppSidebar.others']()} />
        {/* fixme: remove the following spacer */}
        <div style={{ height: '4px' }} />
        <RouteMenuLinkItem
          ref={trashDroppable.setNodeRef}
          icon={<AnimatedDeleteIcon closed={trashDroppable.isOver} />}
          active={trashActive}
          path={paths.trash(currentWorkspaceId)}
        >
          <span data-testid="trash-page">
            {t['com.affine.workspaceSubPath.trash']()}
          </span>
        </RouteMenuLinkItem>
        <ImportPage blocksuiteWorkspace={blockSuiteWorkspace} />
      </SidebarScrollableContainer>
      <SidebarContainer>
        {environment.isDesktop ? <UpdaterButton /> : <AppDownloadButton />}
        <div style={{ height: '4px' }} />
        <AddPageButton onClick={onClickNewPage} />
      </SidebarContainer>
    </AppSidebar>
  );
};
