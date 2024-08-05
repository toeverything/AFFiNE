import { openSettingModalAtom } from '@affine/core/atoms';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { mixpanel } from '@affine/core/mixpanel';
import {
  ExplorerCollections,
  ExplorerFavorites,
  ExplorerMigrationFavorites,
  ExplorerOldFavorites,
  ExplorerOrganize,
} from '@affine/core/modules/explorer';
import { ExplorerTags } from '@affine/core/modules/explorer/views/sections/tags';
import { CMDKQuickSearchService } from '@affine/core/modules/quicksearch/services/cmdk';
import { pathGenerator } from '@affine/core/shared';
import { apis, events } from '@affine/electron-api';
import { useI18n } from '@affine/i18n';
import { AllDocsIcon, SettingsIcon } from '@blocksuite/icons/rc';
import type { Doc } from '@blocksuite/store';
import type { Workspace } from '@toeverything/infra';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useAtomValue, useSetAtom } from 'jotai';
import type { MouseEvent, ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import { WorkbenchService } from '../../modules/workbench';
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
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';
import { WorkspaceSelector } from '../workspace-selector';
import ImportPage from './import-page';
import {
  quickSearch,
  quickSearchAndNewPage,
  workspaceAndUserWrapper,
  workspaceWrapper,
} from './index.css';
import { AppSidebarJournalButton } from './journal-button';
import { TrashButton } from './trash-button';
import { UpdaterButton } from './updater-button';
import { UserInfo } from './user-info';

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

/**
 * This is for the whole affine app sidebar.
 * This component wraps the app sidebar in `@affine/component` with logic and data.
 *
 */
export const RootAppSidebar = (): ReactElement => {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const currentWorkspaceId = currentWorkspace.id;
  const { appSettings } = useAppSettingHelper();
  const docCollection = currentWorkspace.docCollection;
  const t = useI18n();
  const workbench = useService(WorkbenchService).workbench;
  const currentPath = useLiveData(
    workbench.location$.map(location => location.pathname)
  );
  const cmdkQuickSearchService = useService(CMDKQuickSearchService);
  const onOpenQuickSearchModal = useCallback(() => {
    cmdkQuickSearchService.toggle();
    mixpanel.track('QuickSearchOpened', {
      segment: 'navigation panel',
      control: 'search button',
    });
  }, [cmdkQuickSearchService]);

  const allPageActive = currentPath === '/all';

  const pageHelper = usePageHelper(currentWorkspace.docCollection);

  const onClickNewPage = useAsyncCallback(
    async (e?: MouseEvent) => {
      const page = pageHelper.createPage('page', false);
      page.load();
      mixpanel.track('DocCreated', {
        segment: 'navigation panel',
        module: 'bottom button',
        control: 'new doc button',
        category: 'page',
        type: 'doc',
      });
      workbench.openDoc(page.id, {
        at: e?.ctrlKey || e?.metaKey ? 'new-tab' : 'active',
      });
    },
    [pageHelper, workbench]
  );

  // Listen to the "New Page" action from the menu
  useEffect(() => {
    if (environment.isDesktop) {
      return events?.applicationMenu.onNewPageAction(() => onClickNewPage());
    }
    return;
  }, [onClickNewPage]);

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const onOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom({
      activeTab: 'appearance',
      open: true,
    });
    mixpanel.track('SettingsViewed', {
      // page:
      segment: 'navigation panel',
      module: 'general list',
      control: 'settings button',
    });
  }, [setOpenSettingModalAtom]);

  const sidebarOpen = useAtomValue(appSidebarOpenAtom);
  useEffect(() => {
    if (environment.isDesktop) {
      apis?.ui.handleSidebarVisibilityChange(sidebarOpen).catch(err => {
        console.error(err);
      });
    }
  }, [sidebarOpen]);

  return (
    <AppSidebar
      clientBorder={appSettings.clientBorder}
      translucentUI={appSettings.enableBlurBackground}
    >
      <SidebarContainer>
        <div className={workspaceAndUserWrapper}>
          <div className={workspaceWrapper}>
            <WorkspaceSelector />
          </div>
          <UserInfo />
        </div>
        <div className={quickSearchAndNewPage}>
          <QuickSearchInput
            className={quickSearch}
            data-testid="slider-bar-quick-search-button"
            onClick={onOpenQuickSearchModal}
          />
          <AddPageButton onClick={onClickNewPage} />
        </div>
        <MenuLinkItem
          icon={<AllDocsIcon />}
          active={allPageActive}
          to={pathGenerator.all(currentWorkspaceId)}
        >
          <span data-testid="all-pages">
            {t['com.affine.workspaceSubPath.all']()}
          </span>
        </MenuLinkItem>
        <AppSidebarJournalButton
          docCollection={currentWorkspace.docCollection}
        />
        <MenuItem
          data-testid="slider-bar-workspace-setting-button"
          icon={<SettingsIcon />}
          onClick={onOpenSettingModal}
        >
          <span data-testid="settings-modal-trigger">
            {t['com.affine.settingSidebar.title']()}
          </span>
        </MenuItem>
      </SidebarContainer>
      <SidebarScrollableContainer>
        {runtimeConfig.enableNewFavorite && <ExplorerFavorites />}
        {runtimeConfig.enableOrganize && <ExplorerOrganize />}
        {runtimeConfig.enableNewFavorite && <ExplorerMigrationFavorites />}
        {runtimeConfig.enableOldFavorite && <ExplorerOldFavorites />}
        <ExplorerCollections />
        <ExplorerTags />
        <CategoryDivider label={t['com.affine.rootAppSidebar.others']()} />
        <div style={{ padding: '0 8px' }}>
          <TrashButton />
          <ImportPage docCollection={docCollection} />
        </div>
      </SidebarScrollableContainer>
      <SidebarContainer>
        {environment.isDesktop ? <UpdaterButton /> : <AppDownloadButton />}
      </SidebarContainer>
    </AppSidebar>
  );
};

RootAppSidebar.displayName = 'memo(RootAppSidebar)';
