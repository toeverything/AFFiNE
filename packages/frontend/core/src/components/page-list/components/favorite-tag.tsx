import type { IconButtonProps } from '@affine/component';
import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import Lottie from 'lottie-react';
import { forwardRef, useCallback, useState } from 'react';

import favoritedAnimation from './favorited-animation/data.json';

export const FavoriteTag = forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
  } & Omit<IconButtonProps, 'children'>
>(({ active, onClick, ...props }, ref) => {
  const [playAnimation, setPlayAnimation] = useState(false);
  const t = useI18n();
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onClick?.(e);
      setPlayAnimation(!active);
    },
    [active, onClick]
  );
  return (
    <IconButton
      tooltip={active ? t['Favorited']() : t['Favorite']()}
      tooltipOptions={{ side: 'top' }}
      ref={ref}
      onClick={handleClick}
      size="20"
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
          <FavoritedIcon
            color={cssVar('primaryColor')}
            data-testid="favorited-icon"
          />
        )
      ) : (
        <FavoriteIcon />
      )}
    </IconButton>
  );
});
FavoriteTag.displayName = 'FavoriteTag';
