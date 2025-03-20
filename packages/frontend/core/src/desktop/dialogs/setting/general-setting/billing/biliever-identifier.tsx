import { SubscriptionService } from '@affine/core/modules/cloud';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import { BelieverCard } from '../plans/lifetime/believer-card';
import { BelieverBenefits } from '../plans/lifetime/benefits';
import * as styles from './style.css';

export const BelieverIdentifier = ({
  onOpenPlans,
}: {
  onOpenPlans?: () => void;
}) => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  const readableLifetimePrice = useLiveData(
    subscriptionService.prices.readableLifetimePrice$
  );

  if (!readableLifetimePrice) return null;

  return (
    <BelieverCard type={2} style={{ borderRadius: 8, padding: 12 }}>
      <header className={styles.believerHeader}>
        <div>
          <div className={styles.believerTitle}>
            {t['com.affine.payment.billing-setting.believer.title']()}
          </div>
          <div className={styles.believerSubtitle}>
            <Trans
              i18nKey={
                'com.affine.payment.billing-setting.believer.description'
              }
              components={{
                a: <a href="#" onClick={onOpenPlans} />,
              }}
            />
          </div>
        </div>
        <div className={styles.believerPriceWrapper}>
          <div className={styles.believerPrice}>{readableLifetimePrice}</div>
          <div className={styles.believerPriceCaption}>
            {t['com.affine.payment.billing-setting.believer.price-caption']()}
          </div>
        </div>
      </header>
      <BelieverBenefits />
    </BelieverCard>
  );
};
