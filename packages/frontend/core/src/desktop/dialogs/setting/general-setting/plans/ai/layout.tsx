import { useI18n } from '@affine/i18n';
import type { ReactNode } from 'react';

import { PricingCollapsible } from '../layout';
import * as styles from './ai-plan.css';
import { AIBenefits } from './benefits';

export interface AIPlanLayoutProps {
  caption?: ReactNode;
  actionButtons?: ReactNode;
  billingTip?: ReactNode;
}
export const AIPlanLayout = ({
  caption,
  actionButtons,
  billingTip,
}: AIPlanLayoutProps) => {
  const t = useI18n();
  const title = t['com.affine.payment.ai.pricing-plan.title']();

  return (
    <PricingCollapsible title={title} caption={caption}>
      <div className={styles.card}>
        <div className={styles.titleBlock}>
          <section className={styles.titleCaption1}>
            {t['com.affine.payment.ai.pricing-plan.title-caption-1']()}
          </section>
          <section className={styles.title}>
            {t['com.affine.payment.ai.pricing-plan.title']()}
          </section>
          <section className={styles.titleCaption2}>
            {t['com.affine.payment.ai.pricing-plan.title-caption-2']()}
          </section>
        </div>

        <div className={styles.actionBlock}>
          <div className={styles.actionButtons}>{actionButtons}</div>
          {billingTip ? (
            <div className={styles.agreement}>{billingTip}</div>
          ) : null}
        </div>

        <AIBenefits />
      </div>
    </PricingCollapsible>
  );
};
