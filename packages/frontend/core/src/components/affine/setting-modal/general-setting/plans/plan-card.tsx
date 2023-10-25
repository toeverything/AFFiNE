import type {
  Subscription,
  SubscriptionMutator,
} from '@affine/core/hooks/use-subscription';
import {
  cancelSubscriptionMutation,
  checkoutMutation,
  SubscriptionPlan,
  SubscriptionRecurring,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { DoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useAtom } from 'jotai';
import { type PropsWithChildren, useCallback, useEffect, useRef } from 'react';

import { openPaymentDisableAtom } from '../../../../../atoms';
import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import { BulledListIcon } from './icons/bulled-list';
import * as styles from './style.css';

export interface FixedPrice {
  type: 'fixed';
  plan: SubscriptionPlan;
  price: string;
  yearlyPrice: string;
  discount?: string;
  benefits: string[];
}

export interface DynamicPrice {
  type: 'dynamic';
  plan: SubscriptionPlan;
  contact: boolean;
  benefits: string[];
}

interface PlanCardProps {
  detail: FixedPrice | DynamicPrice;
  subscription?: Subscription | null;
  recurring: string;
  onSubscriptionUpdate: SubscriptionMutator;
}

export function getPlanDetail() {
  // const t = useAFFiNEI18N();

  // TODO: i18n all things
  return new Map<SubscriptionPlan, FixedPrice | DynamicPrice>([
    [
      SubscriptionPlan.Free,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Free,
        price: '0',
        yearlyPrice: '0',
        benefits: [
          'Unlimited local workspace',
          'Unlimited login devices',
          'Unlimited blocks',
          'AFFiNE Cloud Storage 10GB',
          'The maximum file size is 10M',
          'Number of members per Workspace ≤ 3',
        ],
      },
    ],
    [
      SubscriptionPlan.Pro,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Pro,
        price: '1',
        yearlyPrice: '1',
        benefits: [
          'Unlimited local workspace',
          'Unlimited login devices',
          'Unlimited blocks',
          'AFFiNE Cloud Storage 100GB',
          'The maximum file size is 500M',
          'Number of members per Workspace ≤ 10',
        ],
      },
    ],
    [
      SubscriptionPlan.Team,
      {
        type: 'dynamic',
        plan: SubscriptionPlan.Team,
        contact: true,
        benefits: [
          'Best team workspace for collaboration and knowledge distilling.',
          'Focusing on what really matters with team project management and automation.',
          'Pay for seats, fits all team size.',
        ],
      },
    ],
    [
      SubscriptionPlan.Enterprise,
      {
        type: 'dynamic',
        plan: SubscriptionPlan.Enterprise,
        contact: true,
        benefits: [
          'Solutions & best practices for dedicated needs.',
          'Embedable & interrogations with IT support.',
        ],
      },
    ],
  ]);
}

export const PlanCard = ({
  detail,
  subscription,
  recurring,
  onSubscriptionUpdate,
}: PlanCardProps) => {
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring = subscription?.recurring;

  const isCurrent =
    loggedIn &&
    detail.plan === currentPlan &&
    (currentPlan === SubscriptionPlan.Free
      ? true
      : currentRecurring === recurring);

  return (
    <div
      data-current={isCurrent}
      key={detail.plan}
      className={isCurrent ? styles.currentPlanCard : styles.planCard}
    >
      <div className={styles.planTitle}>
        <p>
          {detail.plan}{' '}
          {'discount' in detail &&
            recurring === SubscriptionRecurring.Yearly && (
              <span className={styles.discountLabel}>
                {detail.discount}% off
              </span>
            )}
        </p>
        <div className={styles.planPriceWrapper}>
          <p>
            {detail.type === 'dynamic' ? (
              <span className={styles.planPriceDesc}>Coming soon...</span>
            ) : (
              <>
                <span className={styles.planPrice}>
                  $
                  {recurring === SubscriptionRecurring.Monthly
                    ? detail.price
                    : detail.yearlyPrice}
                </span>
                <span className={styles.planPriceDesc}>per month</span>
              </>
            )}
          </p>
        </div>
        {
          // branches:
          //  if contact                                => 'Contact Sales'
          //  if not signed in:
          //    if free                                 => 'Sign up free'
          //    else                                    => 'Buy Pro'
          //  else
          //    if isCurrent                            => 'Current Plan'
          //    else if free                            => 'Downgrade'
          //    else if currentRecurring !== recurring  => 'Change to {recurring} Billing'
          //    else                                    => 'Upgrade'
          // TODO: should replace with components with proper actions
          detail.type === 'dynamic' ? (
            <ContactSales />
          ) : loggedIn ? (
            detail.plan === currentPlan &&
            (currentRecurring === recurring ||
              (!currentRecurring && detail.plan === SubscriptionPlan.Free)) ? (
              <CurrentPlan />
            ) : detail.plan === SubscriptionPlan.Free ? (
              <Downgrade onSubscriptionUpdate={onSubscriptionUpdate} />
            ) : currentRecurring !== recurring &&
              currentPlan === detail.plan ? (
              <ChangeRecurring
                // @ts-expect-error must exist
                from={currentRecurring}
                to={recurring as SubscriptionRecurring}
                onSubscriptionUpdate={onSubscriptionUpdate}
              />
            ) : (
              <Upgrade
                recurring={recurring as SubscriptionRecurring}
                onSubscriptionUpdate={onSubscriptionUpdate}
              />
            )
          ) : (
            <SignupAction>
              {detail.plan === SubscriptionPlan.Free
                ? 'Sign up free'
                : 'Buy Pro'}
            </SignupAction>
          )
        }
      </div>
      <div className={styles.planBenefits}>
        {detail.benefits.map((content, i) => (
          <div key={i} className={styles.planBenefit}>
            <div className={styles.planBenefitIcon}>
              {detail.type == 'dynamic' ? (
                <BulledListIcon color="var(--affine-processing-color)" />
              ) : (
                <DoneIcon
                  width="16"
                  height="16"
                  color="var(--affine-processing-color)"
                />
              )}
            </div>
            <div className={styles.planBenefitText}>{content}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const CurrentPlan = () => {
  return <Button className={styles.planAction}>Current Plan</Button>;
};

const Downgrade = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const { isMutating, trigger } = useMutation({
    mutation: cancelSubscriptionMutation,
  });

  const downgrade = useCallback(() => {
    trigger(null, {
      onSuccess: data => {
        onSubscriptionUpdate(data.cancelSubscription);
      },
    });
  }, [trigger, onSubscriptionUpdate]);

  return (
    <Button
      className={styles.planAction}
      type="primary"
      onClick={downgrade /* TODO: poppup confirmation modal instead */}
      disabled={isMutating}
      loading={isMutating}
    >
      Downgrade
    </Button>
  );
};

const ContactSales = () => {
  return (
    // TODO: add action
    <Button className={styles.planAction} type="primary">
      Contact Sales
    </Button>
  );
};

const Upgrade = ({
  recurring,
  onSubscriptionUpdate,
}: {
  recurring: SubscriptionRecurring;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const { isMutating, trigger } = useMutation({
    mutation: checkoutMutation,
  });

  const newTabRef = useRef<Window | null>(null);

  const onClose = useCallback(() => {
    newTabRef.current = null;
    onSubscriptionUpdate();
  }, [onSubscriptionUpdate]);

  const [, openPaymentDisableModal] = useAtom(openPaymentDisableAtom);
  const upgrade = useCallback(() => {
    if (!runtimeConfig.enablePayment) {
      openPaymentDisableModal(true);
      return;
    }

    if (newTabRef.current) {
      newTabRef.current.focus();
    } else {
      trigger(
        { recurring },
        {
          onSuccess: data => {
            // FIXME: safari prevents from opening new tab by window api
            // TODO(@xp): what if electron?
            const newTab = window.open(
              data.checkout,
              '_blank',
              'noopener noreferrer'
            );

            if (newTab) {
              newTabRef.current = newTab;

              newTab.addEventListener('close', onClose);
            }
          },
        }
      );
    }
  }, [trigger, recurring, onClose, openPaymentDisableModal]);

  useEffect(() => {
    return () => {
      if (newTabRef.current) {
        newTabRef.current.removeEventListener('close', onClose);
        newTabRef.current = null;
      }
    };
  }, [onClose]);

  return (
    <Button
      className={styles.planAction}
      type="primary"
      onClick={upgrade}
      disabled={isMutating}
      loading={isMutating}
    >
      Upgrade
    </Button>
  );
};

const ChangeRecurring = ({
  from: _from /* TODO: from can be useful when showing confirmation modal  */,
  to,
  onSubscriptionUpdate,
}: {
  from: SubscriptionRecurring;
  to: SubscriptionRecurring;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const { isMutating, trigger } = useMutation({
    mutation: updateSubscriptionMutation,
  });

  const change = useCallback(() => {
    trigger(
      { recurring: to },
      {
        onSuccess: data => {
          onSubscriptionUpdate(data.updateSubscriptionRecurring);
        },
      }
    );
  }, [trigger, onSubscriptionUpdate, to]);

  return (
    <Button
      className={styles.planAction}
      type="primary"
      onClick={change /* TODO: popup confirmation modal instead  */}
      disabled={isMutating}
      loading={isMutating}
    >
      Change to {to} Billing
    </Button>
  );
};

const SignupAction = ({ children }: PropsWithChildren) => {
  // TODO: add login action
  return (
    <Button className={styles.planAction} type="primary">
      {children}
    </Button>
  );
};
