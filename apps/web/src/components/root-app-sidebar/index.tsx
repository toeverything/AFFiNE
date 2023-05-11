import {
  AddPageButton,
  AppSidebar,
  appSidebarOpenAtom,
  CategoryDivider,
  MenuLinkItem,
  QuickSearchInput,
  SidebarContainer,
  SidebarScrollableContainer,
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
import { useAtomValue } from 'jotai';
import type { ReactElement } from 'react';
import type React from 'react';
import { useCallback, useEffect } from 'react';

import type { AllWorkspace } from '../../shared';
import ChangeLog from '../pure/workspace-slider-bar/changeLog';
import Favorite from '../pure/workspace-slider-bar/favorite';
import { WorkspaceSelector } from '../pure/workspace-slider-bar/WorkspaceSelector';

export type RootAppSidebarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenWorkspaceListModal: () => void;
  currentWorkspace: AllWorkspace | null;
  currentPageId: string | null;
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
}: {
  currentPath: string; // todo: pass through useRouter?
  path?: string | null;
  icon: ReactElement;
  children?: ReactElement;
}) => {
  const active = currentPath === path;
  return (
    <MenuLinkItem active={active} href={path ?? ''} icon={icon}>
      {children}
    </MenuLinkItem>
  );
};

// type TranslateKey = keyof ReturnType<typeof useAFFiNEI18N>;

// const routeItems = {
//   all: {
//     icon: <FolderIcon />,
//     labelKey: 'All pages',
//   },
// } satisfies {
//   [key in keyof RootAppSidebarProps['paths']]?: {
//     icon: ReactElement;
//     labelKey: TranslateKey;
//   };
// };

// function renderRouteItem(
//   key: keyof typeof routeItems,
//   currentPath: string,
//   t: ReturnType<typeof useAFFiNEI18N>
// ) {
//   const { labelKey, icon } = { ...routeItems[key] };
//   return (
//     <RouteMenuLinkItem icon={icon} path={key} currentPath={currentPath}>
//       <span data-testid={labelKey}>{t[labelKey]()}</span>
//     </RouteMenuLinkItem>
//   );
// }

/**
 * This is for the whole affine app sidebar.
 * This component wraps the app sidebar in `@affine/component` with logic and data.
 *
 * @todo(himself65): rewrite all styled component into @vanilla-extract/css
 */
export const RootAppSidebar = ({
  currentWorkspace,
  currentPageId,
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
  const sidebarOpen = useAtomValue(appSidebarOpenAtom);
  useEffect(() => {
    if (environment.isDesktop && typeof sidebarOpen === 'boolean') {
      window.apis?.ui.handleSidebarVisibilityChange(sidebarOpen);
    }
  }, [sidebarOpen]);

  return (
    <>
      <AppSidebar>
        <SidebarContainer>
          <WorkspaceSelector
            currentWorkspace={currentWorkspace}
            onClick={onOpenWorkspaceListModal}
          />
          <ChangeLog />
          <QuickSearchInput onClick={onOpenQuickSearchModal} />
          <RouteMenuLinkItem
            icon={<FolderIcon />}
            currentPath={currentPath}
            path={currentWorkspaceId && paths.all(currentWorkspaceId)}
          >
            <span data-testid="all-pages">{t['All pages']()}</span>
          </RouteMenuLinkItem>
          <RouteMenuLinkItem
            icon={<SettingsIcon />}
            currentPath={currentPath}
            path={currentWorkspaceId && paths.setting(currentWorkspaceId)}
          >
            <span data-testid="settings">{t['Settings']()}</span>
          </RouteMenuLinkItem>
        </SidebarContainer>

        <SidebarScrollableContainer>
          {blockSuiteWorkspace && (
            <Favorite
              currentPath={currentPath}
              paths={paths}
              currentPageId={currentPageId}
              openPage={openPage}
              currentWorkspace={currentWorkspace}
            />
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
          <AddPageButton onClick={onClickNewPage} />
        </SidebarContainer>
      </AppSidebar>
    </>
  );
};
