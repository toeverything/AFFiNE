import { RadioButton, RadioButtonGroup } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import {
  cancelSubscriptionMutation,
  checkoutMutation,
  pricesQuery,
  SubscriptionPlan,
  subscriptionQuery,
  SubscriptionRecurring,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { Button } from '@toeverything/components/button';
import {
  type PropsWithChildren,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import * as styles from './style.css';

interface FixedPrice {
  type: 'fixed';
  plan: SubscriptionPlan;
  price: string;
  yearlyPrice: string;
  discount?: string;
  benefits: string[];
}

interface DynamicPrice {
  type: 'dynamic';
  plan: SubscriptionPlan;
  contact: boolean;
  benefits: string[];
}

// TODO: i18n all things
const planDetail = new Map<SubscriptionPlan, FixedPrice | DynamicPrice>([
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

const Settings = () => {
  const { data, mutate } = useQuery({
    query: subscriptionQuery,
  });

  const {
    data: { prices },
  } = useQuery({
    query: pricesQuery,
  });

  prices.forEach(price => {
    const detail = planDetail.get(price.plan);

    if (detail?.type === 'fixed') {
      detail.price = (price.amount / 100).toFixed(2);
      detail.yearlyPrice = (price.yearlyAmount / 100 / 12).toFixed(2);
      detail.discount = (
        (1 - price.yearlyAmount / 12 / price.amount) *
        100
      ).toFixed(2);
    }
  });

  const loggedIn = !!data.currentUser;
  const subscription = data.currentUser?.subscription;

  const [recurring, setRecurring] = useState<string>(
    subscription?.recurring ?? SubscriptionRecurring.Monthly
  );

  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring =
    subscription?.recurring ?? SubscriptionRecurring.Monthly;

  const refresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const yearlyDiscount = (
    planDetail.get(SubscriptionPlan.Pro) as FixedPrice | undefined
  )?.discount;

  return (
    <>
      <SettingHeader
        title="Plans"
        subtitle={
          // TODO: different subtitle for un-logged user
          <p>
            You are current on the {currentPlan} plan. If you have any
            questions, please contact our{' '}
            <span>{/*TODO: add action*/}customer support</span>.
          </p>
        }
      />
      <div className={styles.wrapper}>
        <RadioButtonGroup
          className={styles.recurringRadioGroup}
          value={recurring}
          onValueChange={setRecurring}
        >
          {Object.values(SubscriptionRecurring).map(plan => (
            <RadioButton key={plan} value={plan}>
              {plan}
              {plan === SubscriptionRecurring.Yearly && yearlyDiscount && (
                <span className={styles.radioButtonDiscount}>
                  {yearlyDiscount}% off
                </span>
              )}
            </RadioButton>
          ))}
        </RadioButtonGroup>
        {/* TODO: plan cards horizontal scroll behavior is not the same as design */}
        {/* TODO: may scroll current plan into view when first loading? */}
        <div className={styles.planCardsWrapper}>
          {Array.from(planDetail.values()).map(detail => {
            const isCurrent =
              currentPlan === detail.plan && currentRecurring === recurring;
            return (
              <div
                key={detail.plan}
                className={
                  loggedIn && currentPlan === detail.plan
                    ? styles.currentPlanCard
                    : styles.planCard
                }
              >
                <div className={styles.planTitle}>
                  <p>
                    {detail.plan}{' '}
                    {'discount' in detail && (
                      <span className={styles.discountLabel}>
                        {detail.discount}% off
                      </span>
                    )}
                  </p>
                  <p>
                    <span className={styles.planPrice}>
                      $
                      {detail.type === 'dynamic'
                        ? '?'
                        : recurring === SubscriptionRecurring.Monthly
                        ? detail.price
                        : detail.yearlyPrice}
                    </span>
                    <span className={styles.planPriceDesc}>per month</span>
                  </p>
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
                      isCurrent ? (
                        <CurrentPlan />
                      ) : detail.plan === SubscriptionPlan.Free ? (
                        <Downgrade onActionDone={refresh} />
                      ) : currentRecurring !== recurring ? (
                        <ChangeRecurring
                          from={currentRecurring}
                          to={recurring as SubscriptionRecurring}
                          onActionDone={refresh}
                        />
                      ) : (
                        <Upgrade recurring={recurring} onActionDone={refresh} />
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
                        {/* TODO: icons */}
                        {detail.type == 'dynamic' ? '·' : '✅'}
                      </div>
                      {content}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <a
          className={styles.allPlansLink}
          href="https://affine.pro/pricing"
          target="_blank"
          rel="noopener noreferrer"
        >
          See all plans →{/* TODO: icon */}
        </a>
      </div>
    </>
  );
};

const Downgrade = ({ onActionDone }: { onActionDone: () => void }) => {
  const { isMutating, trigger } = useMutation({
    mutation: cancelSubscriptionMutation,
  });

  const downgrade = useCallback(() => {
    trigger(null, { onSuccess: onActionDone });
  }, [trigger, onActionDone]);

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

const Upgrade = ({
  recurring,
  onActionDone,
}: {
  recurring: SubscriptionRecurring;
  onActionDone: () => void;
}) => {
  const { isMutating, trigger, data } = useMutation({
    mutation: checkoutMutation,
  });

  const upgrade = useCallback(() => {
    trigger({ recurring });
  }, [trigger, recurring]);

  const newTabRef = useRef<Window | null>(null);

  useEffect(() => {
    if (data?.checkout) {
      if (newTabRef.current) {
        newTabRef.current.focus();
      } else {
        // FIXME: safari prevents from opening new tab by window api
        // TODO(@xp): what if electron?
        const newTab = window.open(
          data.checkout,
          '_blank',
          'noopener noreferrer'
        );

        if (newTab) {
          newTabRef.current = newTab;
          const update = () => {
            onActionDone();
          };
          newTab.addEventListener('close', update);

          return () => newTab.removeEventListener('close', update);
        }
      }
    }

    return;
  }, [data?.checkout, onActionDone]);

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
  onActionDone,
}: {
  from: SubscriptionRecurring;
  to: SubscriptionRecurring;
  onActionDone: () => void;
}) => {
  const { isMutating, trigger } = useMutation({
    mutation: updateSubscriptionMutation,
  });

  const change = useCallback(() => {
    trigger({ recurring: to }, { onSuccess: onActionDone });
  }, [trigger, onActionDone, to]);

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

const ContactSales = () => {
  return (
    // TODO: add action
    <Button className={styles.planAction} type="primary">
      Contact Sales
    </Button>
  );
};

const CurrentPlan = () => {
  return <Button className={styles.planAction}>Current Plan</Button>;
};

const SignupAction = ({ children }: PropsWithChildren) => {
  // TODO: add login action
  return (
    <Button className={styles.planAction} type="primary">
      {children}
    </Button>
  );
};

export const AFFiNECloudPlans = () => {
  return (
    // TODO: loading skeleton
    // TODO: Error Boundary
    <Suspense>
      <Settings />
    </Suspense>
  );
};
