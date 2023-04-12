import { useTheme } from '@mui/material';
import type { FC } from 'react';

import { InternalLottie } from '../internal-lottie';
import dark from './loading-black.json';
import light from './loading-white.json';

export type AffineLoadingProps = {
  loop?: boolean;
  autoplay?: boolean;
};

export const AffineLoading: FC<AffineLoadingProps> = ({
  loop = false,
  autoplay = false,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <InternalLottie
      key={isDark ? 'dark' : 'light'}
      options={{
        loop: loop,
        autoplay: autoplay,
        animationData: isDark ? light : dark,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
        },
      }}
    />
  );
};
