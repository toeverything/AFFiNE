import React from 'react';
import { FavouritesIcon, TrashIcon, AllPagesIcon } from '@blocksuite/icons';
import Link from 'next/link';
import { StyledJumpTo } from '../style';
import { useModal } from '@/providers/global-modal-provider';
const JumpTo = () => {
  const { triggerQuickSearchModal } = useModal();
  return (
    <StyledJumpTo>
      <strong>Jump to</strong>
      <Link
        href={{ pathname: '/page-list/all' }}
        onClick={() => triggerQuickSearchModal()}
      >
        <AllPagesIcon width={20} height={20} />
        <span> All pages</span>
      </Link>
      <Link
        href={{ pathname: '/page-list/favorite' }}
        onClick={() => triggerQuickSearchModal()}
      >
        <FavouritesIcon width={20} height={20} />
        <span> Favourites</span>
      </Link>
      <Link
        href={{ pathname: '/page-list/trash' }}
        onClick={() => triggerQuickSearchModal()}
      >
        <TrashIcon width={20} height={20} />
        <span> Trash</span>
      </Link>
    </StyledJumpTo>
  );
};

export default JumpTo;
