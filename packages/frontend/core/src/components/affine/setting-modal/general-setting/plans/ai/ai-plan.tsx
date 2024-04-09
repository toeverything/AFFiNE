import {
  type SubscriptionMutator,
  useUserSubscription,
} from '@affine/core/hooks/use-subscription';
import {
  type PricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';

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
      caption={
        subscription
          ? 'You have purchased AFFiNE AI'
          : 'You are current on the Basic plan.'
      }
    >
      <div className={styles.card}>
        <div className={styles.titleBlock}>
          <section className={styles.titleCaption1}>
            Turn all your ideas into reality
          </section>
          <section className={styles.title}>AFFiNE AI</section>
          <section className={styles.titleCaption2}>
            A true multimodal AI copilot.
          </section>
        </div>

        <div className={styles.actionBlock}>
          <Action {...baseActionProps} className={styles.purchaseButton} />
          {billingTip ? (
            <div className={styles.agreement}>{billingTip}</div>
          ) : null}
        </div>

        <AIBenefits />
      </div>
    </AIPlanLayout>
  );
};
