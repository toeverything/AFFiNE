import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ArrowRightBigIcon } from '@blocksuite/icons/rc';
import type { PropsWithChildren } from 'react';

import { SignInBackground } from './background';
import * as styles from './layout.css';

export const MobileSignInLayout = ({
  children,
  onSkip,
}: PropsWithChildren<{
  onSkip: () => void;
}>) => {
  const t = useI18n();
  return (
    <div className={styles.root}>
      <SignInBackground />
      <div className={styles.content}>{children}</div>
      <div className={styles.skipDivider}>
        <div className={styles.skipDividerLine} />
        <span className={styles.skipDividerText}>or</span>
        <div className={styles.skipDividerLine} />
      </div>
      <div className={styles.skipSection}>
        <div className={styles.skipText}>
          {t['com.affine.mobile.sign-in.skip.hint']()}
        </div>
        <Button
          variant="plain"
          onClick={onSkip}
          className={styles.skipLink}
          suffix={<ArrowRightBigIcon className={styles.skipLinkIcon} />}
        >
          {t['com.affine.mobile.sign-in.skip.link']()}
        </Button>
      </div>
    </div>
  );
};
