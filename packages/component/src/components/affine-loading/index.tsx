import { useTheme } from '@mui/material';

import { InternalLottie } from '../internal-lottie';
import dark from './loading-black.json';
import light from './loading-white.json';

export const AffineLoading = () => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <InternalLottie
      key={isDark ? 'dark' : 'light'}
      options={{
        loop: false,
        autoplay: false,
        animationData: isDark ? light : dark,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
        },
      }}
    />
  );
};
