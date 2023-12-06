import { AuthPageContainer } from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback } from 'react';

import { useNavigateHelper } from '../hooks/use-navigate-helper';
import * as styles from './upgrade-success.css';

export const UpgradeSuccess = () => {
  const t = useAFFiNEI18N();

  const { jumpToIndex } = useNavigateHelper();
  const openAffine = useCallback(() => {
    jumpToIndex();
  }, [jumpToIndex]);

  const subtitle = (
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
  );

  return (
    <AuthPageContainer
      title={t['com.affine.payment.upgrade-success-page.title']()}
      subtitle={subtitle}
    >
      <Button type="primary" size="extraLarge" onClick={openAffine}>
        {t['com.affine.other-page.nav.open-affine']()}
      </Button>
    </AuthPageContainer>
  );
};

export const Component = () => {
  return <UpgradeSuccess />;
};
