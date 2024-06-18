import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightBigIcon } from '@blocksuite/icons/rc';

import * as styles from './share-footer.css';

export const ShareFooter = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.footerContainer}>
      <div className={styles.footer}>
        <div className={styles.description}>
          {t['com.affine.share-page.footer.description']()}
        </div>
        <a
          className={styles.getStartLink}
          href="https://affine.pro/"
          target="_blank"
          rel="noreferrer"
        >
          {t['com.affine.share-page.footer.get-started']()}
          <ArrowRightBigIcon fontSize={16} />
        </a>
      </div>
    </div>
  );
};
