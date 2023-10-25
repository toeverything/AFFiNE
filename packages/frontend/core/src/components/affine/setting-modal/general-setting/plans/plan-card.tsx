import type {
  Subscription,
  SubscriptionMutator,
} from '@affine/core/hooks/use-subscription';
import {
  cancelSubscriptionMutation,
  checkoutMutation,
  resumeSubscriptionMutation,
  SubscriptionPlan,
  SubscriptionRecurring,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { DoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { authAtom } from '../../../../../atoms/index';
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

export function getPlanDetail(t: ReturnType<typeof useAFFiNEI18N>) {
  return new Map<SubscriptionPlan, FixedPrice | DynamicPrice>([
    [
      SubscriptionPlan.Free,
      {
        type: 'fixed',
        plan: SubscriptionPlan.Free,
        price: '0',
        yearlyPrice: '0',
        benefits: [
          t['com.affine.settings.plans.benefit-1'](),
          t['com.affine.settings.plans.benefit-2'](),
          t['com.affine.settings.plans.benefit-3'](),
          t['com.affine.settings.plans.benefit-4']({ capacity: '10GB' }),
          t['com.affine.settings.plans.benefit-5']({ capacity: '10M' }),
          t['com.affine.settings.plans.benefit-6']({ capacity: '3' }),
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
          t['com.affine.settings.plans.benefit-1'](),
          t['com.affine.settings.plans.benefit-2'](),
          t['com.affine.settings.plans.benefit-3'](),
          t['com.affine.settings.plans.benefit-4']({ capacity: '100GB' }),
          t['com.affine.settings.plans.benefit-5']({ capacity: '500M' }),
          t['com.affine.settings.plans.benefit-6']({ capacity: '10' }),
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
          t['com.affine.settings.plans.dynamic-benefit-1'](),
          t['com.affine.settings.plans.dynamic-benefit-2'](),
          t['com.affine.settings.plans.dynamic-benefit-3'](),
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
          t['com.affine.settings.plans.dynamic-benefit-4'](),
          t['com.affine.settings.plans.dynamic-benefit-5'](),
        ],
      },
    ],
  ]);
}

export const PlanCard = (props: PlanCardProps) => {
  const { detail, subscription, recurring } = props;
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
        <ActionButton {...props} />
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

const ActionButton = ({
  detail,
  subscription,
  recurring,
  onSubscriptionUpdate,
}: PlanCardProps) => {
  const t = useAFFiNEI18N();
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring = subscription?.recurring;

  // branches:
  //  if contact                                => 'Contact Sales'
  //  if not signed in:
  //    if free                                 => 'Sign up free'
  //    else                                    => 'Buy Pro'
  //  else
  //    if isCurrent
  //      if canceled                           => 'Resume'
  //      else                                  => 'Current Plan'
  //    if isCurrent                            => 'Current Plan'
  //    else if free                            => 'Downgrade'
  //    else if currentRecurring !== recurring  => 'Change to {recurring} Billing'
  //    else                                    => 'Upgrade'

  // contact
  if (detail.type === 'dynamic') {
    return <ContactSales />;
  }

  // not signed in
  if (!loggedIn) {
    return (
      <SignUpAction>
        {detail.plan === SubscriptionPlan.Free
          ? t['com.affine.settings.plans.sign-up-free']()
          : t['com.affine.settings.plans.buy-pro']()}
      </SignUpAction>
    );
  }

  const isCanceled = !!subscription?.canceledAt;
  const isFree = detail.plan === SubscriptionPlan.Free;
  const isCurrent =
    detail.plan === currentPlan &&
    (isFree ? true : currentRecurring === recurring);

  // is current
  if (isCurrent) {
    return isCanceled ? (
      <ResumeAction onSubscriptionUpdate={onSubscriptionUpdate} />
    ) : (
      <CurrentPlan />
    );
  }

  if (isFree) {
    return (
      <Downgrade
        disabled={isCanceled}
        onSubscriptionUpdate={onSubscriptionUpdate}
      />
    );
  }

  return currentPlan === detail.plan ? (
    <ChangeRecurring
      from={currentRecurring as SubscriptionRecurring}
      to={recurring as SubscriptionRecurring}
      onSubscriptionUpdate={onSubscriptionUpdate}
      disabled={isCanceled}
    />
  ) : (
    <Upgrade
      recurring={recurring as SubscriptionRecurring}
      onSubscriptionUpdate={onSubscriptionUpdate}
    />
  );
};

const CurrentPlan = () => {
  const t = useAFFiNEI18N();
  return (
    <Button className={styles.planAction}>
      {t['com.affine.settings.plans.current-plan']()}
    </Button>
  );
};

const Downgrade = ({
  disabled,
  onSubscriptionUpdate,
}: {
  disabled?: boolean;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
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

  const tooltipContent = disabled
    ? t['com.affine.settings.plans.downgraded-tooltip']()
    : null;

  return (
    <Tooltip content={tooltipContent} rootOptions={{ delayDuration: 0 }}>
      <div className={styles.planAction}>
        <Button
          className={styles.planAction}
          type="primary"
          onClick={downgrade /* TODO: poppup confirmation modal instead */}
          disabled={disabled || isMutating}
          loading={isMutating}
        >
          {t['com.affine.settings.plans.downgrade']()}
        </Button>
      </div>
    </Tooltip>
  );
};

const ContactSales = () => {
  const t = useAFFiNEI18N();
  return (
    <a
      className={styles.planAction}
      href="https://6dxre9ihosp.typeform.com/to/uZeBtpPm"
      target="_blank"
      rel="noreferrer"
    >
      <Button className={styles.planAction} type="primary">
        {t['com.affine.settings.plans.contact-sales']()}
      </Button>
    </a>
  );
};

const Upgrade = ({
  recurring,
  onSubscriptionUpdate,
}: {
  recurring: SubscriptionRecurring;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
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
      {t['com.affine.settings.plans.upgrade']()}
    </Button>
  );
};

const ChangeRecurring = ({
  from: _from /* TODO: from can be useful when showing confirmation modal  */,
  to,
  disabled,
  onSubscriptionUpdate,
}: {
  from: SubscriptionRecurring;
  to: SubscriptionRecurring;
  disabled?: boolean;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
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
      disabled={disabled || isMutating}
      loading={isMutating}
    >
      {t['com.affine.settings.plans.change-to']({ to })}
    </Button>
  );
};

const SignUpAction = ({ children }: PropsWithChildren) => {
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(async () => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return (
    <Button
      onClick={onClickSignIn}
      className={styles.planAction}
      type="primary"
    >
      {children}
    </Button>
  );
};

const ResumeAction = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
  const [hovered, setHovered] = useState(false);
  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });

  const resume = useCallback(() => {
    trigger(null, {
      onSuccess: data => {
        onSubscriptionUpdate(data.resumeSubscription);
      },
    });
  }, [trigger, onSubscriptionUpdate]);

  return (
    <Button
      className={styles.planAction}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={resume}
      loading={isMutating}
      disabled={isMutating}
    >
      {hovered
        ? t['com.affine.settings.plans.resume']()
        : t['com.affine.settings.plans.current-plan']()}
    </Button>
  );
};
