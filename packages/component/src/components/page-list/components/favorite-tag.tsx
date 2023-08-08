import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons';
import {
  IconButton,
  type IconButtonProps,
} from '@toeverything/components/button';
import { forwardRef } from 'react';

import { Tooltip } from '../../..';

export const FavoriteTag = forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
  } & Omit<IconButtonProps, 'children'>
>(({ active, onClick, ...props }, ref) => {
  const t = useAFFiNEI18N();
  return (
    <Tooltip
      content={active ? t['Favorited']() : t['Favorite']()}
      placement="top-start"
    >
      <IconButton
        ref={ref}
        active={active}
        onClick={e => {
          e.stopPropagation();
          onClick?.(e);
        }}
        {...props}
      >
        {active ? (
          <FavoritedIcon data-testid="favorited-icon" />
        ) : (
          <FavoriteIcon />
        )}
      </IconButton>
    </Tooltip>
  );
});
FavoriteTag.displayName = 'FavoriteTag';
