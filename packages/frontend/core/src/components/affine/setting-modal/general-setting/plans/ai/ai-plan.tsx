import { useCurrentLoginStatus } from '@affine/core/hooks/affine/use-current-login-status';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '@affine/core/hooks/use-subscription';
import { timestampToLocalDate } from '@affine/core/utils';
import {
  type PricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';

import { AIPlanLayout } from '../layout';
import * as styles from './ai-plan.css';
import { AIBenefits } from './benefits';
import { AICancel } from './cancel';
import { AILogin } from './login';
import { AIResume } from './resume';
import { AISubscribe } from './subscribe';
import type { BaseActionProps } from './types';

interface AIPlanProps {
  price?: PricesQuery['prices'][number];
  onSubscriptionUpdate: SubscriptionMutator;
}
export const AIPlan = ({ price, onSubscriptionUpdate }: AIPlanProps) => {
  const plan = SubscriptionPlan.AI;
  const recurring = SubscriptionRecurring.Yearly;

  const loggedIn = useCurrentLoginStatus() === 'authenticated';

  const [subscription] = useUserSubscription(plan);

  // yearly subscription should always be available
  if (!price?.yearlyAmount) return null;

  const baseActionProps: BaseActionProps = {
    plan,
    price,
    recurring,
    onSubscriptionUpdate,
  };
  const isCancelled = !!subscription?.canceledAt;

  const Action = !loggedIn
    ? AILogin
    : !subscription
      ? AISubscribe
      : isCancelled
        ? AIResume
        : AICancel;

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
          <Action {...baseActionProps} />
          {subscription?.nextBillAt ? (
            <PurchasedTip due={timestampToLocalDate(subscription.nextBillAt)} />
          ) : null}
        </div>

        <AIBenefits />
      </div>
    </AIPlanLayout>
  );
};

const PurchasedTip = ({ due }: { due: string }) => (
  <div className={styles.agreement}>
    You have purchased AFFiNE AI. The next payment date is {due}.
  </div>
);
