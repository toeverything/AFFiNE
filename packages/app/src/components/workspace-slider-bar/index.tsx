import React, { useState } from 'react';
import { useRouter } from 'next/router';
import {
  StyledArrowButton,
  StyledLink,
  StyledListItem,
  StyledListItemForWorkspace,
  StyledNewPageButton,
  StyledSliderBar,
  StyledSubListItem,
} from './style';
import { Arrow } from './icons';
import Collapse from '@mui/material/Collapse';
import {
  ArrowDownIcon,
  SearchIcon,
  AllPagesIcon,
  FavouritesIcon,
  ImportIcon,
  TrashIcon,
  AddIcon,
  FavouritedIcon,
} from '@blocksuite/icons';
import Link from 'next/link';
import { Tooltip } from '@/ui/tooltip';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';
import { useGoToPage } from '@/providers/app-state-provider/hooks';

import { IconButton } from '@/ui/button';
import { WorkspaceSelector } from './WorkspaceSelector';
import useLocalStorage from '@/hooks/use-local-storage';
import { useTranslation } from '@/libs/i18n';
const FavoriteList = ({ showList }: { showList: boolean }) => {
  const { pageList, openPage } = useEditor();
  const router = useRouter();

  const favoriteList = pageList.filter(p => p.favorite && !p.trash);
  return (
    <Collapse in={showList}>
      {favoriteList.map((pageMeta, index) => {
        const active = router.query.pageId === pageMeta.id;
        return (
          <StyledSubListItem
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
        <StyledSubListItem disable={true}>No item</StyledSubListItem>
      )}
    </Collapse>
  );
};
export const WorkSpaceSliderBar = () => {
  const { triggerQuickSearchModal, triggerImportModal } = useModal();
  const [showSubFavorite, setShowSubFavorite] = useState(true);
  const { createPage } = useEditor();
  const goToPage = useGoToPage();
  const router = useRouter();

  const [showTip, setShowTip] = useState(false);
  const [show, setShow] = useLocalStorage('AFFINE_SLIDE_BAR', false, true);
  const { t } = useTranslation();
  return (
    <>
      <StyledSliderBar show={show}>
        <StyledListItemForWorkspace>
          <WorkspaceSelector />
        </StyledListItemForWorkspace>
        <StyledListItem
          data-testid="sliderBar-quickSearchButton"
          onClick={() => {
            triggerQuickSearchModal();
          }}
        >
          <SearchIcon /> Quick search
        </StyledListItem>
        <Link href={{ pathname: '/page-list/all' }}>
          <StyledListItem active={router.pathname === '/page-list/all'}>
            <AllPagesIcon /> <span>All pages</span>
          </StyledListItem>
        </Link>
        <StyledListItem active={router.pathname === '/page-list/favorite'}>
          <StyledLink href={{ pathname: '/page-list/favorite' }}>
            <FavouritesIcon />
            Favourites
          </StyledLink>
          <IconButton
            darker={true}
            onClick={() => {
              setShowSubFavorite(!showSubFavorite);
            }}
          >
            <ArrowDownIcon
              style={{
                transform: `rotate(${showSubFavorite ? '180' : '0'}deg)`,
              }}
            />
          </IconButton>
        </StyledListItem>
        <FavoriteList showList={showSubFavorite} />

        <Tooltip content="Coming soon" placement="right-start" zIndex={9999}>
          <StyledListItem
            disabled={true}
            onClick={() => {
              // triggerImportModal();
            }}
          >
            <ImportIcon /> Import
          </StyledListItem>
        </Tooltip>

        <Link href={{ pathname: '/page-list/trash' }}>
          <StyledListItem active={router.pathname === '/page-list/trash'}>
            <TrashIcon /> Trash
          </StyledListItem>
        </Link>
        <StyledNewPageButton
          onClick={async () => {
            const page = await createPage();
            goToPage(page.pageId);
          }}
        >
          <AddIcon /> New Page
        </StyledNewPageButton>
      </StyledSliderBar>
      <Tooltip
        content={show ? 'Collapse sidebar' : 'Expand sidebar'}
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
    </>
  );
};

export default WorkSpaceSliderBar;
