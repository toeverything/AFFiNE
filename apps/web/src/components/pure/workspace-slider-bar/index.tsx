import { MuiCollapse } from '@affine/component';
import { IconButton } from '@affine/component';
import { config } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import {
  ArrowDownSmallIcon,
  DeleteTemporarilyIcon,
  FavoriteIcon,
  FolderIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
} from '@blocksuite/icons';
import type { Page, PageMeta } from '@blocksuite/store';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

import { useSidebarStatus } from '../../../hooks/affine/use-sidebar-status';
import { usePageMeta } from '../../../hooks/use-page-meta';
import type { RemWorkspace } from '../../../shared';
import { SidebarSwitch } from '../../affine/sidebar-switch';
import { Pivot } from './pivot';
import {
  StyledLink,
  StyledListItem,
  StyledNewPageButton,
  StyledSidebarWrapper,
  StyledSliderBar,
  StyledSliderBarWrapper,
  StyledSubListItem,
} from './style';
import { WorkspaceSelector } from './WorkspaceSelector';

export type FavoriteListProps = {
  currentPageId: string | null;
  openPage: (pageId: string) => void;
  showList: boolean;
  pageMeta: PageMeta[];
};

const FavoriteList: React.FC<FavoriteListProps> = ({
  pageMeta,
  openPage,
  showList,
}) => {
  const router = useRouter();
  const { t } = useTranslation();
  const favoriteList = useMemo(
    () => pageMeta.filter(p => p.favorite && !p.trash),
    [pageMeta]
  );

  return (
    <MuiCollapse
      in={showList}
      style={{
        maxHeight: 300,
        overflowY: 'auto',
      }}
    >
      {favoriteList.map((pageMeta, index) => {
        const active = router.query.pageId === pageMeta.id;
        return (
          <div key={`${pageMeta}-${index}`}>
            <StyledSubListItem
              data-testid={`favorite-list-item-${pageMeta.id}`}
              active={active}
              ref={ref => {
                if (ref && active) {
                  ref.scrollIntoView({ behavior: 'smooth' });
                }
              }}
              onClick={() => {
                if (active) {
                  return;
                }
                openPage(pageMeta.id);
              }}
            >
              {pageMeta.title || 'Untitled'}
            </StyledSubListItem>
          </div>
        );
      })}
      {favoriteList.length === 0 && (
        <StyledSubListItem disable={true}>{t('No item')}</StyledSubListItem>
      )}
    </MuiCollapse>
  );
};

export type WorkSpaceSliderBarProps = {
  isPublicWorkspace: boolean;
  onOpenQuickSearchModal: () => void;
  onOpenWorkspaceListModal: () => void;
  currentWorkspace: RemWorkspace | null;
  currentPageId: string | null;
  openPage: (pageId: string) => void;
  createPage: () => Page;
  currentPath: string;
  paths: {
    all: (workspaceId: string) => string;
    favorite: (workspaceId: string) => string;
    trash: (workspaceId: string) => string;
    setting: (workspaceId: string) => string;
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
  const [showSubFavorite, setOpenSubFavorite] = useState(true);
  const { t } = useTranslation();
  const [sidebarOpen] = useSidebarStatus();
  const pageMeta = usePageMeta(currentWorkspace?.blockSuiteWorkspace ?? null);
  const onClickNewPage = useCallback(async () => {
    const page = await createPage();
    openPage(page.id);
  }, [createPage, openPage]);
  return (
    <>
      <StyledSliderBar show={isPublicWorkspace ? false : sidebarOpen}>
        <StyledSidebarWrapper>
          <SidebarSwitch
            visible={sidebarOpen}
            tooltipContent={t('Collapse sidebar')}
            testid="sliderBar-arrowButton-collapse"
          />
        </StyledSidebarWrapper>

        <StyledSliderBarWrapper data-testid="sliderBar">
          <WorkspaceSelector
            currentWorkspace={currentWorkspace}
            onClick={onOpenWorkspaceListModal}
          />

          <StyledListItem
            data-testid="slider-bar-quick-search-button"
            style={{ cursor: 'pointer' }}
            onClick={useCallback(() => {
              onOpenQuickSearchModal();
            }, [onOpenQuickSearchModal])}
          >
            <SearchIcon />
            {t('Quick search')}
          </StyledListItem>
          <Link
            href={{
              pathname: currentWorkspaceId && paths.all(currentWorkspaceId),
            }}
          >
            <StyledListItem
              active={
                currentPath ===
                (currentWorkspaceId && paths.all(currentWorkspaceId))
              }
            >
              <FolderIcon />
              <span data-testid="all-pages">{t('All pages')}</span>
            </StyledListItem>
          </Link>

          {config.enableSubpage && !!currentWorkspace && (
            <Pivot
              currentWorkspace={currentWorkspace}
              openPage={openPage}
              allMetas={pageMeta}
            />
          )}

          <StyledListItem
            active={
              currentPath ===
              (currentWorkspaceId && paths.favorite(currentWorkspaceId))
            }
          >
            <StyledLink
              href={{
                pathname:
                  currentWorkspaceId && paths.favorite(currentWorkspaceId),
              }}
            >
              <FavoriteIcon />
              {t('Favorites')}
            </StyledLink>
            <IconButton
              darker={true}
              onClick={useCallback(() => {
                setOpenSubFavorite(!showSubFavorite);
              }, [showSubFavorite])}
            >
              <ArrowDownSmallIcon
                style={{
                  transform: `rotate(${showSubFavorite ? '180' : '0'}deg)`,
                }}
              />
            </IconButton>
          </StyledListItem>
          <FavoriteList
            currentPageId={currentPageId}
            showList={showSubFavorite}
            openPage={openPage}
            pageMeta={pageMeta}
          />
          <StyledListItem
            active={
              currentPath ===
              (currentWorkspaceId && paths.setting(currentWorkspaceId))
            }
            data-testid="slider-bar-workspace-setting-button"
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

          {/* <WorkspaceSetting
            isShow={showWorkspaceSetting}
            onClose={() => {
              setOpenWorkspaceSetting(false);
            }}
          /> */}
          {/* TODO: will finish the feature next version */}
          {/* <StyledListItem
            onClick={() => {
              triggerImportModal();
            }}
          >
            <ImportIcon /> {t('Import')}
          </StyledListItem> */}

          <Link
            href={{
              pathname: currentWorkspaceId && paths.trash(currentWorkspaceId),
            }}
          >
            <StyledListItem
              active={
                currentPath ===
                (currentWorkspaceId && paths.trash(currentWorkspaceId))
              }
            >
              <DeleteTemporarilyIcon /> {t('Trash')}
            </StyledListItem>
          </Link>
          <StyledNewPageButton
            data-testid="new-page-button"
            onClick={onClickNewPage}
          >
            <PlusIcon /> {t('New Page')}
          </StyledNewPageButton>
        </StyledSliderBarWrapper>
      </StyledSliderBar>
    </>
  );
};

export default WorkSpaceSliderBar;
