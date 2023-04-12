import { useTheme } from '@mui/material';
import type { FC } from 'react';

import { InternalLottie } from '../internal-lottie';
import dark from './loading-black.json';
import light from './loading-white.json';

export type AffineLoadingProps = {
  loop?: boolean;
  autoplay?: boolean;
  autoReverse?: boolean;
};

export const AffineLoading: FC<AffineLoadingProps> = ({
  loop = false,
  autoplay = false,
  autoReverse = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <InternalLottie
      key={isDark ? 'dark' : 'light'}
      speed={2}
      options={{
        loop,
        autoplay,
        autoReverse,
        animationData: isDark ? light : dark,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
        },
      }}
    />
  );
};
