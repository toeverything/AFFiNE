import React from 'react';
import {
  MiddleFavouritesIcon,
  MiddleTrashIcon,
  MiddleAllPagesIcon,
} from '@blocksuite/icons';
import Link from 'next/link';
import { StyledJumpTo } from '../style';
const JumpTo = () => {
  return (
    <StyledJumpTo>
      <strong>Jump to</strong>
      <Link href={{ pathname: '/all-page', query: { name: 'test' } }}>
        <MiddleAllPagesIcon width={20} height={20} />
        <span> All pages</span>
      </Link>
      <Link href={'/'}>
        <MiddleFavouritesIcon width={20} height={20} />
        <span> Favourites</span>
      </Link>
      <Link href={'/'}>
        <MiddleTrashIcon width={20} height={20} />
        <span> Trash</span>
      </Link>
    </StyledJumpTo>
  );
};

export default JumpTo;
