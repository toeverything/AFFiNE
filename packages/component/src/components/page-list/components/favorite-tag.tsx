import type { IconButtonProps } from '@affine/component';
import { IconButton, Tooltip } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons';
import { forwardRef } from 'react';

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
        iconSize={[20, 20]}
        style={{
          color: active
            ? 'var(--affine-primary-color)'
            : 'var(--affine-icon-color)',
        }}
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
