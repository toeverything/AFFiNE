import { useTheme } from 'next-themes';

import darkArt from './art-dark.inline.svg';
import lightArt from './art-light.inline.svg';
import { arts, wrapper } from './style.css';

export function SignInBackgroundArts() {
  const { resolvedTheme } = useTheme();

  return (
    <div className={wrapper}>
      <img
        src={resolvedTheme === 'dark' ? darkArt : lightArt}
        className={arts}
      />
    </div>
  );
}
