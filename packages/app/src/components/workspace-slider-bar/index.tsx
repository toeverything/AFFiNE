import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Avatar from '@mui/material/Avatar';
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
} from '@blocksuite/icons';
import Link from 'next/link';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';

import { IconButton } from '@/ui/button';
import { WorkspaceSelector } from './WorkspaceSelector';

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
            {pageMeta.title || pageMeta.id}
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
  const [show, setShow] = useState(false);
  const [showSubFavorite, setShowSubFavorite] = useState(true);
  const { createPage, getPageMeta, openPage } = useEditor();
  const router = useRouter();

  return (
    <>
      <StyledSliderBar show={show}>
        <StyledListItemForWorkspace>
          <WorkspaceSelector />
        </StyledListItemForWorkspace>
        <StyledListItem
          onClick={() => {
            triggerQuickSearchModal();
          }}
        >
          <SearchIcon /> Quick search
        </StyledListItem>
        <Link href={{ pathname: '/page-list/all' }}>
          <StyledListItem active={router.pathname === '/page-list/all'}>
            <AllPagesIcon /> All pages
          </StyledListItem>
        </Link>
        <StyledListItem active={router.pathname === '/page-list/favorite'}>
          <StyledLink href={{ pathname: '/page-list/favorite' }}>
            <FavouritesIcon />
            Favourites
          </StyledLink>
          <IconButton
            hoverBackground="#E0E6FF"
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

        <StyledListItem
          onClick={() => {
            triggerImportModal();
          }}
        >
          <ImportIcon /> Import
        </StyledListItem>

        <Link href={{ pathname: '/page-list/trash' }}>
          <StyledListItem active={router.pathname === '/page-list/trash'}>
            <TrashIcon /> Trash
          </StyledListItem>
        </Link>
        <StyledNewPageButton
          onClick={async () => {
            const page = await createPage();
            const pageMeta = getPageMeta(page.id);
            pageMeta && openPage(pageMeta.id);
          }}
        >
          <AddIcon /> New Page
        </StyledNewPageButton>
      </StyledSliderBar>
      <StyledArrowButton
        isShow={show}
        onClick={() => {
          setShow(!show);
        }}
      >
        <Arrow />
      </StyledArrowButton>
    </>
  );
};

export default WorkSpaceSliderBar;
