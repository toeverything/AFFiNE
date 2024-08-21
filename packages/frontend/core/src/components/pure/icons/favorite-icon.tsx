import { FavoritedIcon, FavoriteIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import type { SVGProps } from 'react';

export const IsFavoriteIcon = ({
  favorite,
  style,
  ...props
}: { favorite?: boolean } & SVGProps<SVGSVGElement>) => {
  return favorite ? (
    <FavoritedIcon
      style={{ color: cssVar('primaryColor'), ...style }}
      {...props}
    />
  ) : (
    <FavoriteIcon style={style} {...props} />
  );
};
