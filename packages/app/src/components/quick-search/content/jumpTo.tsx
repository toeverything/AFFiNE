import React from 'react';
import {
  MiddleFavouritesIcon,
  MiddleTrashIcon,
  MiddleAllPagesIcon,
} from '@blocksuite/icons';
const JumpTo = () => {
  return (
    <div>
      <div>Jump to</div>
      <div>
        <MiddleAllPagesIcon />
        <span> All pages</span>
      </div>
      <div>
        <MiddleFavouritesIcon />
        <span> Favourites</span>
      </div>
      <div>
        <MiddleTrashIcon />
        <span> Trash</span>
      </div>
    </div>
  );
};

export default JumpTo;
