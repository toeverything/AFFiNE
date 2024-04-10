import { Button } from '@affine/component';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '@affine/core/hooks/use-subscription';
import {
  type PricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { AIPlanLayout } from '../layout';
import * as styles from './ai-plan.css';
import { AIBenefits } from './benefits';
import type { BaseActionProps } from './types';
import { useAffineAISubscription } from './use-affine-ai-subscription';

interface AIPlanProps {
  price?: PricesQuery['prices'][number];
  onSubscriptionUpdate: SubscriptionMutator;
}
export const AIPlan = ({ price, onSubscriptionUpdate }: AIPlanProps) => {
  const t = useAFFiNEI18N();
  const recurring = SubscriptionRecurring.Yearly;

  const { Action, billingTip } = useAffineAISubscription();
  const [subscription] = useUserSubscription(SubscriptionPlan.AI);

  // yearly subscription should always be available
  if (!price?.yearlyAmount) return null;

  const baseActionProps: BaseActionProps = {
    price,
    recurring,
    onSubscriptionUpdate,
  };

  return (
    <AIPlanLayout
      title={t['com.affine.payment.ai.pricing-plan.title']()}
      caption={
        subscription
          ? t['com.affine.payment.ai.pricing-plan.caption-purchased']()
          : t['com.affine.payment.ai.pricing-plan.caption-free']()
      }
    >
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
          <div className={styles.actionButtons}>
            <Action {...baseActionProps} className={styles.purchaseButton} />
            {subscription ? null : (
              <a href="https://ai.affine.pro" target="_blank" rel="noreferrer">
                <Button className={styles.learnAIButton}>
                  {t['com.affine.payment.ai.pricing-plan.learn']()}
                </Button>
              </a>
            )}
          </div>
          {billingTip ? (
            <div className={styles.agreement}>{billingTip}</div>
          ) : null}
        </div>

        <AIBenefits />
      </div>
    </AIPlanLayout>
  );
};
