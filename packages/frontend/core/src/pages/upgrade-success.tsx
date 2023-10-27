import { Empty } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Logo1Icon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useCallback } from 'react';

import { useNavigateHelper } from '../hooks/use-navigate-helper';
import * as styles from './upgrade-success.css';

export const UpgradeSuccess = () => {
  const t = useAFFiNEI18N();

  const openDownloadLink = useCallback(() => {
    const url = `https://affine.pro/download`;
    open(url, '_blank');
  }, []);

  const { jumpToIndex } = useNavigateHelper();
  const openAffine = useCallback(() => {
    jumpToIndex();
  }, [jumpToIndex]);

  return (
    <div className={styles.root}>
      <div className={styles.topNav}>
        <a href="/" rel="noreferrer" className={styles.affineLogo}>
          <Logo1Icon width={24} height={24} />
        </a>

        <div className={styles.topNavLinks}>
          <a
            href="https://affine.pro"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.official-website']()}
          </a>
          <a
            href="https://community.affine.pro/home"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.affine-community']()}
          </a>
          <a
            href="https://affine.pro/blog"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.blog']()}
          </a>
          <a
            href="https://affine.pro/about-us"
            target="_blank"
            rel="noreferrer"
            className={styles.topNavLink}
          >
            {t['com.affine.other-page.nav.contact-us']()}
          </a>
        </div>

        <Button onClick={openDownloadLink}>
          {t['com.affine.auth.open.affine.download-app']()}
        </Button>
      </div>
      <div className={styles.body}>
        <div className={styles.leftContainer}>
          <div className={styles.leftContentTitle}>
            {t['com.affine.payment.upgrade-success-page.title']()}
          </div>
          <div className={styles.leftContentText}>
            {t['com.affine.payment.upgrade-success-page.text']()}
            <div>
              <Trans
                i18nKey={'com.affine.payment.upgrade-success-page.support'}
                components={{
                  1: (
                    <a
                      href="mailto:support@toeverything.info"
                      className={styles.mail}
                    />
                  ),
                }}
              />
            </div>
          </div>
          <div>
            <Button type="primary" size="extraLarge" onClick={openAffine}>
              {t['com.affine.other-page.nav.open-affine']()}
            </Button>
          </div>
        </div>
        <Empty />
      </div>
    </div>
  );
};

export const Component = () => {
  return <UpgradeSuccess />;
};
