import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons';
import {
  IconButton,
  type IconButtonProps,
} from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import Lottie from 'lottie-react';
import { forwardRef, useState } from 'react';

import favoritedAnimation from './favorited-animation/data.json';

export const FavoriteTag = forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
  } & Omit<IconButtonProps, 'children'>
>(({ active, onClick, ...props }, ref) => {
  const [playAnimation, setPlayAnimation] = useState(false);
  const t = useAFFiNEI18N();
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClick?.(e);
    setPlayAnimation(true);
  };
  const handleFavoritedClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClick?.(e);
    setPlayAnimation(false);
  };
  return (
    <Tooltip content={active ? t['Favorited']() : t['Favorite']()} side="top">
      <IconButton
        ref={ref}
        active={active}
        onClick={active ? handleFavoritedClick : handleClick}
        {...props}
      >
        {active ? (
          playAnimation ? (
            <Lottie
              loop={false}
              animationData={favoritedAnimation}
              onComplete={() => setPlayAnimation(false)}
              style={{ width: '20px', height: '20px' }}
            />
          ) : (
            <FavoritedIcon data-testid="favorited-icon" />
          )
        ) : (
          <FavoriteIcon />
        )}
      </IconButton>
    </Tooltip>
  );
});
FavoriteTag.displayName = 'FavoriteTag';
