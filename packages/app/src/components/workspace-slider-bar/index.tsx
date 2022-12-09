import React, { useState } from 'react';
import { useRouter } from 'next/router';
import {
  StyledArrowButton,
  StyledListItem,
  StyledNewPageButton,
  StyledSliderBar,
  StyledSubListItem,
} from './style';
import { Arrow } from './icons';
import Collapse from '@mui/material/Collapse';
import { MiddleIconArrowDownSmallIcon } from '@blocksuite/icons';
import Link from 'next/link';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';

import { IconButton } from '@/ui/button';

const FavoriteList = ({ showList }: { showList: boolean }) => {
  const { pageList, openPage } = useEditor();
  const router = useRouter();

  const favoriteList = pageList.filter(p => p.favorite);
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
  const { triggerQuickSearchModal } = useModal();
  const [show, setShow] = useState(false);
  const [showSubFavorite, setShowSubFavorite] = useState(false);
  const { createPage } = useEditor();
  const router = useRouter();

  return (
    <>
      <StyledSliderBar show={show}>
        <StyledListItem
          onClick={() => {
            triggerQuickSearchModal(true);
          }}
        >
          Quick search
        </StyledListItem>
        <StyledListItem
          onClick={() => {
            router.push({
              pathname: '/',
              query: {
                pageId: new Date().getTime().toString(),
              },
            });
          }}
        >
          Back to Doc
        </StyledListItem>
        <Link href={{ pathname: '/page-list/all' }}>
          <StyledListItem active={router.pathname === '/page-list/all'}>
            All pages
          </StyledListItem>
        </Link>
        <StyledListItem active={router.pathname === '/page-list/favorite'}>
          <Link
            href={{ pathname: '/page-list/favorite' }}
            style={{ flexGrow: 1, textAlign: 'left', color: 'inherit' }}
          >
            Favourites
          </Link>
          <IconButton
            hoverBackground="#E0E6FF"
            onClick={() => {
              setShowSubFavorite(!showSubFavorite);
            }}
          >
            <MiddleIconArrowDownSmallIcon
              style={{
                transform: `rotate(${showSubFavorite ? '180' : '0'}deg)`,
              }}
            />
          </IconButton>
        </StyledListItem>
        <FavoriteList showList={showSubFavorite} />

        <StyledListItem>Import</StyledListItem>

        <Link href={{ pathname: '/page-list/trash' }}>
          <StyledListItem active={router.pathname === '/page-list/trash'}>
            Trash
          </StyledListItem>
        </Link>
        <StyledNewPageButton
          onClick={() => {
            createPage();
          }}
        >
          New Page
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
