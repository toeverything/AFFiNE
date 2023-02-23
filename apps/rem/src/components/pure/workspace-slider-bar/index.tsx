import { MuiCollapse } from '@affine/component';
import { Tooltip } from '@affine/component';
import { IconButton } from '@affine/component';
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
import { PageMeta } from '@blocksuite/store';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useMemo, useState } from 'react';

import { usePageMeta } from '../../../hooks/use-page-meta';
import { RemWorkspace } from '../../../shared';
import { Arrow } from './icons';
import {
  StyledArrowButton,
  StyledLink,
  StyledListItem,
  StyledNewPageButton,
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
    <MuiCollapse in={showList}>
      {favoriteList.map((pageMeta, index) => {
        const active = router.query.pageId === pageMeta.id;
        return (
          <StyledSubListItem
            data-testid={`favorite-list-item-${pageMeta.id}`}
            active={active}
            key={`${pageMeta}-${index}`}
            onClick={() => {
              if (active) {
                return;
              }
              openPage(pageMeta.id);
            }}
          >
            {pageMeta.title || 'Untitled'}
          </StyledSubListItem>
        );
      })}
      {favoriteList.length === 0 && (
        <StyledSubListItem disable={true}>{t('No item')}</StyledSubListItem>
      )}
    </MuiCollapse>
  );
};

export type WorkSpaceSliderBarProps = {
  triggerQuickSearchModal: () => void;
  currentWorkspace: RemWorkspace | null;
  onClickWorkspaceListModal: () => void;
  currentPageId: string | null;
  openPage: (pageId: string) => void;
  createPage: () => Promise<string | null>;
  show: boolean;
  setShow: (show: boolean) => void;
  currentPath: string;
  paths: {
    all: (workspaceId: string | null) => string;
    favorite: (workspaceId: string | null) => string;
    trash: (workspaceId: string | null) => string;
    setting: (workspaceId: string | null) => string;
  };
};

export const WorkSpaceSliderBar: React.FC<WorkSpaceSliderBarProps> = ({
  triggerQuickSearchModal,
  currentWorkspace,
  currentPageId,
  openPage,
  createPage,
  show,
  setShow,
  currentPath,
  paths,
  onClickWorkspaceListModal,
}) => {
  const currentWorkspaceId = currentWorkspace?.id || null;
  const [showSubFavorite, setShowSubFavorite] = useState(true);
  const [showTip, setShowTip] = useState(false);
  const { t } = useTranslation();
  const pageMeta = usePageMeta(
    currentWorkspace && 'blockSuiteWorkspace' in currentWorkspace
      ? currentWorkspace.blockSuiteWorkspace
      : undefined
  );
  return (
    <>
      <StyledSliderBar show={show}>
        <Tooltip
          content={show ? t('Collapse sidebar') : t('Expand sidebar')}
          placement="right"
          visible={showTip}
        >
          <StyledArrowButton
            data-testid="sliderBar-arrowButton"
            isShow={show}
            onClick={() => {
              setShow(!show);
              setShowTip(false);
            }}
            onMouseEnter={() => {
              setShowTip(true);
            }}
            onMouseLeave={() => {
              setShowTip(false);
            }}
          >
            <Arrow />
          </StyledArrowButton>
        </Tooltip>

        <StyledSliderBarWrapper data-testid="sliderBar">
          <WorkspaceSelector
            currentWorkspace={currentWorkspace}
            onClick={onClickWorkspaceListModal}
          />

          <StyledListItem
            data-testid="sliderBar-quickSearchButton"
            style={{ cursor: 'pointer' }}
            onClick={() => {
              triggerQuickSearchModal();
            }}
          >
            <SearchIcon />
            {t('Quick search')}
          </StyledListItem>
          <Link href={{ pathname: paths.all(currentWorkspaceId) }}>
            <StyledListItem
              active={currentPath === paths.all(currentWorkspaceId)}
            >
              <FolderIcon />
              <span data-testid="all-pages">{t('All pages')}</span>
            </StyledListItem>
          </Link>
          <StyledListItem
            active={currentPath === paths.favorite(currentWorkspaceId)}
          >
            <StyledLink href={{ pathname: paths.favorite(currentWorkspaceId) }}>
              <FavoriteIcon />
              {t('Favorites')}
            </StyledLink>
            <IconButton
              darker={true}
              onClick={() => {
                setShowSubFavorite(!showSubFavorite);
              }}
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
            active={currentPath === paths.setting(currentWorkspaceId)}
          >
            <StyledLink href={{ pathname: paths.setting(currentWorkspaceId) }}>
              <SettingsIcon />
              {t('Workspace Settings')}
            </StyledLink>
          </StyledListItem>

          {/* <WorkspaceSetting
            isShow={showWorkspaceSetting}
            onClose={() => {
              setShowWorkspaceSetting(false);
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

          <Link href={{ pathname: paths.trash(currentWorkspaceId) }}>
            <StyledListItem
              active={currentPath === paths.trash(currentWorkspaceId)}
            >
              <DeleteTemporarilyIcon /> {t('Trash')}
            </StyledListItem>
          </Link>
          <StyledNewPageButton
            onClick={async () => {
              const pageId = await createPage();
              if (pageId) {
                openPage(pageId);
              }
            }}
          >
            <PlusIcon /> {t('New Page')}
          </StyledNewPageButton>
        </StyledSliderBarWrapper>
      </StyledSliderBar>
    </>
  );
};

export default WorkSpaceSliderBar;
