import { useTheme } from 'next-themes';

import artsDark from './art-dark.inline.svg';
import artsLight from './art-light.inline.svg';
import * as styles from './background.css';

export const SignInBackground = () => {
  const { resolvedTheme } = useTheme();

  return (
    <div className={styles.root}>
      <div className={styles.dotBg} />
      <img
        className={styles.arts}
        src={resolvedTheme === 'dark' ? artsDark : artsLight}
      />
    </div>
  );
};
