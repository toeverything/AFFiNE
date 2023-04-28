import {
  AppSidebar,
  appSidebarOpenAtom,
  ResizeIndicator,
} from '@affine/component/app-sidebar';
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
import type { Page } from '@blocksuite/store';
import { useAtomValue } from 'jotai';
import type { ReactElement, UIEvent } from 'react';
import React, { useCallback, useEffect, useState } from 'react';

import type { AllWorkspace } from '../../shared';
import ChangeLog from '../pure/workspace-slider-bar/changeLog';
import Favorite from '../pure/workspace-slider-bar/favorite';
import { StyledListItem } from '../pure/workspace-slider-bar/shared-styles';
import {
  StyledLink,
  StyledNewPageButton,
  StyledScrollWrapper,
  StyledSliderBarInnerWrapper,
} from '../pure/workspace-slider-bar/style';
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
  const { t } = useTranslation();
  const [isScrollAtTop, setIsScrollAtTop] = useState(true);
  const onClickNewPage = useCallback(async () => {
    const page = await createPage();
    openPage(page.id);
  }, [createPage, openPage]);
  const sidebarOpen = useAtomValue(appSidebarOpenAtom);
  useEffect(() => {
    if (environment.isDesktop && typeof sidebarOpen === 'boolean') {
      window.apis?.onSidebarVisibilityChange(sidebarOpen);
    }
  }, [sidebarOpen]);
  const [ref, setRef] = useState<HTMLElement | null>(null);
  return (
    <>
      <AppSidebar
        ref={setRef}
        footer={
          <StyledNewPageButton
            data-testid="new-page-button"
            onClick={onClickNewPage}
          >
            <PlusIcon /> {t('New Page')}
          </StyledNewPageButton>
        }
      >
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
              <div>{t('Workspace Settings')}</div>
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
                pathname: currentWorkspaceId && paths.trash(currentWorkspaceId),
              }}
            >
              <DeleteTemporarilyIcon /> {t('Trash')}
            </StyledLink>
          </StyledListItem>
        </StyledSliderBarInnerWrapper>
      </AppSidebar>
      <ResizeIndicator targetElement={ref} />
    </>
  );
};
