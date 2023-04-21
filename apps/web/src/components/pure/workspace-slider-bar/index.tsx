import { config } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import {
  DeleteTemporarilyIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
} from '@blocksuite/icons';
import type { Page, PageMeta } from '@blocksuite/store';
import type React from 'react';
import type { UIEvent } from 'react';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';

import {
  useSidebarFloating,
  useSidebarResizing,
  useSidebarStatus,
  useSidebarWidth,
} from '../../../hooks/use-sidebar-status';
import type { AllWorkspace } from '../../../shared';
import { ChangeLog } from './changeLog';
import Favorite from './favorite';
import { Pinboard } from './Pinboard';
import { RouteNavigation } from './RouteNavigation';
import { StyledListItem } from './shared-styles';
import {
  StyledLink,
  StyledNewPageButton,
  StyledScrollWrapper,
  StyledSidebarHeader,
  StyledSliderBar,
  StyledSliderBarInnerWrapper,
  StyledSliderBarWrapper,
  StyledSliderModalBackground,
} from './style';
import { WorkspaceSelector } from './WorkspaceSelector';

const SidebarSwitch = lazy(() =>
  import('../../affine/sidebar-switch').then(module => ({
    default: module.SidebarSwitch,
  }))
);

export type FavoriteListProps = {
  currentPageId: string | null;
  openPage: (pageId: string) => void;
  showList: boolean;
  pageMeta: PageMeta[];
};

export type WorkSpaceSliderBarProps = {
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

export const WorkSpaceSliderBar: React.FC<WorkSpaceSliderBarProps> = ({
  isPublicWorkspace,
  currentWorkspace,
  currentPageId,
  openPage,
  createPage,
  currentPath,
  paths,
  onOpenQuickSearchModal,
  onOpenWorkspaceListModal,
}) => {
  const currentWorkspaceId = currentWorkspace?.id || null;
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useSidebarStatus();
  const onClickNewPage = useCallback(async () => {
    const page = await createPage();
    openPage(page.id);
  }, [createPage, openPage]);
  const floatingSlider = useSidebarFloating();
  const [sliderWidth] = useSidebarWidth();
  const [isResizing] = useSidebarResizing();
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const show = isPublicWorkspace ? false : sidebarOpen;
  const actualWidth = floatingSlider ? 'calc(10vw + 400px)' : sliderWidth;
  useEffect(() => {
    if (environment.isDesktop) {
      window.apis?.onSidebarVisibilityChange(sidebarOpen);
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

  return (
    <>
      <StyledSliderBarWrapper
        resizing={isResizing}
        floating={floatingSlider}
        show={show}
        style={{ width: actualWidth }}
        data-testid="sliderBar-root"
      >
        <StyledSliderBar>
          <StyledSidebarHeader>
            <RouteNavigation />
            <Suspense>
              <SidebarSwitch
                visible={sidebarOpen}
                tooltipContent={t('Collapse sidebar')}
                data-testid="sliderBar-arrowButton-collapse"
              />
            </Suspense>
          </StyledSidebarHeader>

          <StyledSliderBarInnerWrapper data-testid="sliderBar-inner">
            <WorkspaceSelector
              currentWorkspace={currentWorkspace}
              onClick={onOpenWorkspaceListModal}
            />
            <ChangeLog />
            <StyledListItem
              data-testid="slider-bar-quick-search-button"
              onClick={useCallback(() => {
                onOpenQuickSearchModal();
              }, [onOpenQuickSearchModal])}
            >
              <SearchIcon />
              {t('Quick search')}
            </StyledListItem>
            <StyledListItem
              active={
                currentPath ===
                (currentWorkspaceId && paths.setting(currentWorkspaceId))
              }
              data-testid="slider-bar-workspace-setting-button"
              style={{
                marginBottom: '16px',
              }}
            >
              <StyledLink
                href={{
                  pathname:
                    currentWorkspaceId && paths.setting(currentWorkspaceId),
                }}
              >
                <SettingsIcon />
                {t('Workspace Settings')}
              </StyledLink>
            </StyledListItem>
            <StyledListItem
              active={
                currentPath ===
                (currentWorkspaceId && paths.all(currentWorkspaceId))
              }
            >
              <StyledLink
                href={{
                  pathname: currentWorkspaceId && paths.all(currentWorkspaceId),
                }}
              >
                <FolderIcon />
                <span data-testid="all-pages">{t('All pages')}</span>
              </StyledLink>
            </StyledListItem>
            <StyledScrollWrapper
              showTopBorder={!isScrollAtTop}
              onScroll={(e: UIEvent<HTMLDivElement>) => {
                (e.target as HTMLDivElement).scrollTop === 0
                  ? setIsScrollAtTop(true)
                  : setIsScrollAtTop(false);
              }}
            >
              {blockSuiteWorkspace && (
                <Favorite
                  currentPath={currentPath}
                  paths={paths}
                  currentPageId={currentPageId}
                  openPage={openPage}
                  currentWorkspace={currentWorkspace}
                />
              )}
              {blockSuiteWorkspace && (
                <Pinboard
                  blockSuiteWorkspace={blockSuiteWorkspace}
                  openPage={openPage}
                />
              )}
            </StyledScrollWrapper>
            <div style={{ height: 16 }}></div>
            {config.enableLegacyCloud &&
              (currentWorkspace?.flavour === WorkspaceFlavour.AFFINE &&
              currentWorkspace.public ? (
                <StyledListItem>
                  <StyledLink
                    href={{
                      pathname:
                        currentWorkspaceId && paths.setting(currentWorkspaceId),
                    }}
                  >
                    <ShareIcon />
                    <span data-testid="Published-to-web">Published to web</span>
                  </StyledLink>
                </StyledListItem>
              ) : (
                <StyledListItem
                  active={
                    currentPath ===
                    (currentWorkspaceId && paths.shared(currentWorkspaceId))
                  }
                >
                  <StyledLink
                    href={{
                      pathname:
                        currentWorkspaceId && paths.shared(currentWorkspaceId),
                    }}
                  >
                    <ShareIcon />
                    <span data-testid="shared-pages">{t('Shared Pages')}</span>
                  </StyledLink>
                </StyledListItem>
              ))}
            <StyledListItem
              active={
                currentPath ===
                (currentWorkspaceId && paths.trash(currentWorkspaceId))
              }
            >
              <StyledLink
                href={{
                  pathname:
                    currentWorkspaceId && paths.trash(currentWorkspaceId),
                }}
              >
                <DeleteTemporarilyIcon /> {t('Trash')}
              </StyledLink>
            </StyledListItem>
          </StyledSliderBarInnerWrapper>

          <StyledNewPageButton
            data-testid="new-page-button"
            onClick={onClickNewPage}
          >
            <PlusIcon /> {t('New Page')}
          </StyledNewPageButton>
        </StyledSliderBar>
      </StyledSliderBarWrapper>
      <StyledSliderModalBackground
        data-testid="sliderBar-modalBackground"
        active={floatingSlider && sidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
    </>
  );
};

export default WorkSpaceSliderBar;
