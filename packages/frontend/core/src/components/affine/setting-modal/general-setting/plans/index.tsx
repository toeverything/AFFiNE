import { RadioButton, RadioButtonGroup } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import {
  cancelSubscriptionMutation,
  checkoutMutation,
  pricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { DoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import {
  type PropsWithChildren,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '../../../../../hooks/use-subscription';
import { BulledListIcon } from './icons/bulled-list';
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
  const [subscription, mutateSubscription] = useUserSubscription();
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const scrollWrapper = useRef<HTMLDivElement>(null);

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

  const [recurring, setRecurring] = useState<string>(
    subscription?.recurring ?? SubscriptionRecurring.Yearly
  );

  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring = subscription?.recurring;

  const yearlyDiscount = (
    planDetail.get(SubscriptionPlan.Pro) as FixedPrice | undefined
  )?.discount;

  // auto scroll to current plan card
  useEffect(() => {
    if (!scrollWrapper.current) return;
    const currentPlanCard = scrollWrapper.current?.querySelector(
      '[data-current="true"]'
    );
    const wrapperComputedStyle = getComputedStyle(scrollWrapper.current);
    const left = currentPlanCard
      ? currentPlanCard.getBoundingClientRect().left -
        scrollWrapper.current.getBoundingClientRect().left -
        parseInt(wrapperComputedStyle.paddingLeft)
      : 0;
    const appeared =
      scrollWrapper.current.getAttribute('data-appeared') === 'true';
    const animationFrameId = requestAnimationFrame(() => {
      scrollWrapper.current?.scrollTo({
        behavior: appeared ? 'smooth' : 'instant',
        left,
      });
      scrollWrapper.current?.setAttribute('data-appeared', 'true');
    });
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [recurring]);

  return (
    <>
      <SettingHeader
        title="Plans"
        subtitle={
          loggedIn ? (
            <p>
              You are current on the {currentPlan} plan. If you have any
              questions, please contact our{' '}
              <span>{/*TODO: add action*/}customer support</span>.
            </p>
          ) : (
            <p>
              This is the Pricing plans of AFFiNE Cloud. You can sign up or sign
              in to your account first.
            </p>
          )
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
        <div className={styles.planCardsWrapper} ref={scrollWrapper}>
          {Array.from(planDetail.values()).map(detail => {
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
                        <span className={styles.planPriceDesc}>
                          Coming soon...
                        </span>
                      ) : (
                        <>
                          <span className={styles.planPrice}>
                            $
                            {recurring === SubscriptionRecurring.Monthly
                              ? detail.price
                              : detail.yearlyPrice}
                          </span>
                          <span className={styles.planPriceDesc}>
                            per month
                          </span>
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
                        (!currentRecurring &&
                          detail.plan === SubscriptionPlan.Free)) ? (
                        <CurrentPlan />
                      ) : detail.plan === SubscriptionPlan.Free ? (
                        <Downgrade onSubscriptionUpdate={mutateSubscription} />
                      ) : currentRecurring !== recurring &&
                        currentPlan === detail.plan ? (
                        <ChangeRecurring
                          // @ts-expect-error must exist
                          from={currentRecurring}
                          to={recurring as SubscriptionRecurring}
                          onSubscriptionUpdate={mutateSubscription}
                        />
                      ) : (
                        <Upgrade
                          recurring={recurring as SubscriptionRecurring}
                          onSubscriptionUpdate={mutateSubscription}
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
                          <BulledListIcon color="var(--affine-primary-color)" />
                        ) : (
                          <DoneIcon color="var(--affine-primary-color)" />
                        )}
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

  const upgrade = useCallback(() => {
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
  }, [trigger, recurring, onClose]);

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
