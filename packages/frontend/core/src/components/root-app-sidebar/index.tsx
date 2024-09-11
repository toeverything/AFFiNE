import { openSettingModalAtom } from '@affine/core/atoms';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { track } from '@affine/core/mixpanel';
import {
  ExplorerCollections,
  ExplorerFavorites,
  ExplorerMigrationFavorites,
  ExplorerOrganize,
} from '@affine/core/modules/explorer';
import { ExplorerTags } from '@affine/core/modules/explorer/views/sections/tags';
import { CMDKQuickSearchService } from '@affine/core/modules/quicksearch/services/cmdk';
import { isNewTabTrigger } from '@affine/core/utils';
import { apis, events } from '@affine/electron-api';
import { useI18n } from '@affine/i18n';
import {
  AllDocsIcon,
  GithubIcon,
  JournalIcon,
  SettingsIcon,
} from '@blocksuite/icons/rc';
import type { Doc } from '@blocksuite/store';
import type { Workspace } from '@toeverything/infra';
import {
  useLiveData,
  useServices,
  WorkspaceService,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import type { MouseEvent, ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

import { WorkbenchService } from '../../modules/workbench';
import {
  AddPageButton,
  AppDownloadButton,
  AppSidebar,
  CategoryDivider,
  MenuItem,
  MenuLinkItem,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
} from '../app-sidebar';
import { ExternalMenuLinkItem } from '../app-sidebar/menu-item/external-menu-link-item';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';
import { WorkspaceNavigator } from '../workspace-selector';
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
  const { workbenchService, workspaceService, cMDKQuickSearchService } =
    useServices({
      WorkspaceService,
      WorkbenchService,
      CMDKQuickSearchService,
    });
  const currentWorkspace = workspaceService.workspace;
  const docCollection = currentWorkspace.docCollection;
  const t = useI18n();
  const workbench = workbenchService.workbench;
  const currentPath = useLiveData(
    workbench.location$.map(location => location.pathname)
  );
  const onOpenQuickSearchModal = useCallback(() => {
    cMDKQuickSearchService.toggle();
  }, [cMDKQuickSearchService]);

  const allPageActive = currentPath === '/all';

  const pageHelper = usePageHelper(currentWorkspace.docCollection);

  const onClickNewPage = useAsyncCallback(
    async (e?: MouseEvent) => {
      pageHelper.createPage(undefined, isNewTabTrigger(e) ? 'new-tab' : true);
      track.$.navigationPanel.$.createDoc();
    },
    [pageHelper]
  );

  useEffect(() => {
    if (environment.isElectron) {
      return events?.applicationMenu.onNewPageAction(() => {
        apis?.ui
          .isActiveTab()
          .then(isActive => {
            if (!isActive) {
              return;
            }
            onClickNewPage();
          })
          .catch(err => {
            console.error(err);
          });
      });
    }
    return;
  }, [onClickNewPage]);

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const onOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom({
      activeTab: 'appearance',
      open: true,
    });
    track.$.navigationPanel.$.openSettings();
  }, [setOpenSettingModalAtom]);

  return (
    <AppSidebar>
      <SidebarContainer>
        <div className={workspaceAndUserWrapper}>
          <div className={workspaceWrapper}>
            <WorkspaceNavigator
              showEnableCloudButton
              showSettingsButton
              showSyncStatus
            />
          </div>
          <UserInfo />
        </div>
        <div className={quickSearchAndNewPage}>
          <QuickSearchInput
            className={quickSearch}
            data-testid="slider-bar-quick-search-button"
            data-event-props="$.navigationPanel.$.quickSearch"
            onClick={onOpenQuickSearchModal}
          />
          <AddPageButton onClick={onClickNewPage} />
        </div>
        <MenuLinkItem icon={<AllDocsIcon />} active={allPageActive} to={'/all'}>
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
        <ExplorerFavorites />
        {runtimeConfig.enableOrganize && <ExplorerOrganize />}
        <ExplorerMigrationFavorites />
        <ExplorerCollections />
        <ExplorerTags />
        <CategoryDivider label={t['com.affine.rootAppSidebar.others']()} />
        <div style={{ padding: '0 8px' }}>
          <TrashButton />
          <ImportPage docCollection={docCollection} />
          <ExternalMenuLinkItem
            href="https://affine.pro/blog?tag=Release+Note"
            icon={<JournalIcon />}
            label={t['com.affine.app-sidebar.learn-more']()}
          />
          <ExternalMenuLinkItem
            href="https://github.com/toeverything/affine"
            icon={<GithubIcon />}
            label={t['com.affine.app-sidebar.star-us']()}
          />
        </div>
      </SidebarScrollableContainer>
      <SidebarContainer>
        {environment.isElectron ? <UpdaterButton /> : <AppDownloadButton />}
      </SidebarContainer>
    </AppSidebar>
  );
};

RootAppSidebar.displayName = 'memo(RootAppSidebar)';
