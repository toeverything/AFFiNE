import type { PropsWithChildren } from 'react';

import { SignInBackground } from './background';
import * as styles from './layout.css';

export const MobileSignInLayout = ({ children }: PropsWithChildren) => {
  return (
    <div className={styles.root}>
      <SignInBackground />
      <div className={styles.content}>{children}</div>
    </div>
  );
};
