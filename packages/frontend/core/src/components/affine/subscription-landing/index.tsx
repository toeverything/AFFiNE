import { AuthPageContainer } from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type ReactNode, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

import * as styles from './styles.css';

const UpgradeSuccessLayout = ({
  title,
  description,
}: {
  title?: ReactNode;
  description?: ReactNode;
}) => {
  const t = useAFFiNEI18N();
  const [params] = useSearchParams();

  const { jumpToIndex, openInApp } = useNavigateHelper();
  const openAffine = useCallback(() => {
    if (params.get('schema')) {
      openInApp(params.get('schema') ?? 'affine', 'bring-to-front');
    } else {
      jumpToIndex();
    }
  }, [jumpToIndex, openInApp, params]);

  const subtitle = (
    <div className={styles.leftContentText}>
      {description}
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
    <AuthPageContainer title={title} subtitle={subtitle}>
      <Button type="primary" size="extraLarge" onClick={openAffine}>
        {t['com.affine.other-page.nav.open-affine']()}
      </Button>
    </AuthPageContainer>
  );
};

export const CloudUpgradeSuccess = () => {
  const t = useAFFiNEI18N();
  return (
    <UpgradeSuccessLayout
      title={t['com.affine.payment.upgrade-success-page.title']()}
      description={t['com.affine.payment.upgrade-success-page.text']()}
    />
  );
};

export const AIUpgradeSuccess = () => {
  const t = useAFFiNEI18N();

  return (
    <UpgradeSuccessLayout
      title={t['com.affine.payment.ai-upgrade-success-page.title']()}
      description={t['com.affine.payment.ai-upgrade-success-page.text']()}
    />
  );
};
