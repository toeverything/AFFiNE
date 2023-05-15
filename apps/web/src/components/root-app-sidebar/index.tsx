import {
  AddPageButton,
  AppSidebar,
  appSidebarOpenAtom,
  AppUpdaterButton,
  CategoryDivider,
  MenuLinkItem,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
  updateAvailableAtom,
} from '@affine/component/app-sidebar';
import { config } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { WorkspaceFlavour } from '@affine/workspace/type';
import {
  DeleteTemporarilyIcon,
  FolderIcon,
  SettingsIcon,
  ShareIcon,
} from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useAtom, useAtomValue } from 'jotai';
import type { ReactElement } from 'react';
import type React from 'react';
import { useCallback, useEffect } from 'react';

import type { AllWorkspace } from '../../shared';
import FavoriteList from '../pure/workspace-slider-bar/favorite/favorite-list';
import { WorkspaceSelector } from '../pure/workspace-slider-bar/WorkspaceSelector';

export type RootAppSidebarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenWorkspaceListModal: () => void;
  currentWorkspace: AllWorkspace | null;
  openPage: (pageId: string) => void;
  createPage: () => Page;
  currentPath: string;
  paths: {
    all: (workspaceId: string) => string;
    favorite: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    setting: (workspaceId: string) => string;
    shared: (workspaceId: string) => string;
  };
};

const RouteMenuLinkItem = ({
  currentPath,
  path,
  icon,
  children,
  ...props
}: {
  currentPath: string; // todo: pass through useRouter?
  path?: string | null;
  icon: ReactElement;
  children?: ReactElement;
} & React.HTMLAttributes<HTMLDivElement>) => {
  const active = currentPath === path;
  return (
    <MenuLinkItem {...props} active={active} href={path ?? ''} icon={icon}>
      {children}
    </MenuLinkItem>
  );
};

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
  currentPath,
  paths,
  onOpenQuickSearchModal,
  onOpenWorkspaceListModal,
}: RootAppSidebarProps): ReactElement => {
  const currentWorkspaceId = currentWorkspace?.id || null;
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const t = useAFFiNEI18N();
  const onClickNewPage = useCallback(async () => {
    const page = await createPage();
    openPage(page.id);
  }, [createPage, openPage]);

  // Listen to the "New Page" action from the menu
  useEffect(() => {
    if (environment.isDesktop) {
      return window.events?.applicationMenu.onNewPageAction(onClickNewPage);
    }
  }, [onClickNewPage]);

  const [sidebarOpen, setSidebarOpen] = useAtom(appSidebarOpenAtom);
  useEffect(() => {
    if (environment.isDesktop && typeof sidebarOpen === 'boolean') {
      window.apis?.ui.handleSidebarVisibilityChange(sidebarOpen);
    }
  }, [sidebarOpen]);

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if ((e.key === '/' && e.metaKey) || (e.key === '/' && e.ctrlKey)) {
        setSidebarOpen(!sidebarOpen);
      }
    };
    document.addEventListener('keydown', keydown, { capture: true });
    return () =>
      document.removeEventListener('keydown', keydown, { capture: true });
  }, [sidebarOpen, setSidebarOpen]);

  const clientUpdateAvailable = useAtomValue(updateAvailableAtom);

  return (
    <>
      <AppSidebar>
        <SidebarContainer>
          <WorkspaceSelector
            currentWorkspace={currentWorkspace}
            onClick={onOpenWorkspaceListModal}
          />
          <QuickSearchInput
            data-testid="slider-bar-quick-search-button"
            onClick={onOpenQuickSearchModal}
          />
          <RouteMenuLinkItem
            icon={<FolderIcon />}
            currentPath={currentPath}
            path={currentWorkspaceId && paths.all(currentWorkspaceId)}
          >
            <span data-testid="all-pages">{t['All pages']()}</span>
          </RouteMenuLinkItem>
          <RouteMenuLinkItem
            data-testid="slider-bar-workspace-setting-button"
            icon={<SettingsIcon />}
            currentPath={currentPath}
            path={currentWorkspaceId && paths.setting(currentWorkspaceId)}
          >
            <span data-testid="settings">{t['Settings']()}</span>
          </RouteMenuLinkItem>
        </SidebarContainer>

        <SidebarScrollableContainer>
          <CategoryDivider label={t['Favorites']()} />
          {blockSuiteWorkspace && (
            <FavoriteList currentWorkspace={currentWorkspace} />
          )}
          {config.enableLegacyCloud &&
            (currentWorkspace?.flavour === WorkspaceFlavour.AFFINE &&
            currentWorkspace.public ? (
              <RouteMenuLinkItem
                icon={<ShareIcon />}
                currentPath={currentPath}
                path={currentWorkspaceId && paths.setting(currentWorkspaceId)}
              >
                <span data-testid="Published-to-web">Published to web</span>
              </RouteMenuLinkItem>
            ) : (
              <RouteMenuLinkItem
                icon={<ShareIcon />}
                currentPath={currentPath}
                path={currentWorkspaceId && paths.shared(currentWorkspaceId)}
              >
                <span data-testid="shared-pages">{t['Shared Pages']()}</span>
              </RouteMenuLinkItem>
            ))}

          <CategoryDivider label={t['others']()} />
          <RouteMenuLinkItem
            icon={<DeleteTemporarilyIcon />}
            currentPath={currentPath}
            path={currentWorkspaceId && paths.trash(currentWorkspaceId)}
          >
            <span data-testid="trash-page">{t['Trash']()}</span>
          </RouteMenuLinkItem>
        </SidebarScrollableContainer>
        <SidebarContainer>
          {clientUpdateAvailable && <AppUpdaterButton />}
          <AddPageButton onClick={onClickNewPage} />
        </SidebarContainer>
      </AppSidebar>
    </>
  );
};
