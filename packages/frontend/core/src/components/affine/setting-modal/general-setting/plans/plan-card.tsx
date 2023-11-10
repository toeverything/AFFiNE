import type {
  Subscription,
  SubscriptionMutator,
} from '@affine/core/hooks/use-subscription';
import {
  checkoutMutation,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  updateSubscriptionMutation,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { DoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useSetAtom } from 'jotai';
import { useAtom } from 'jotai';
import { nanoid } from 'nanoid';
import {
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { openPaymentDisableAtom } from '../../../../../atoms';
import { authAtom } from '../../../../../atoms/index';
import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import { CancelAction, ResumeAction } from './actions';
import { BulledListIcon } from './icons/bulled-list';
import { ConfirmLoadingModal } from './modals';
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
  onNotify: (info: {
    detail: FixedPrice | DynamicPrice;
    recurring: string;
  }) => void;
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
          t['com.affine.payment.benefit-1'](),
          t['com.affine.payment.benefit-2'](),
          t['com.affine.payment.benefit-3'](),
          t['com.affine.payment.benefit-4']({ capacity: '10GB' }),
          t['com.affine.payment.benefit-5']({ capacity: '10M' }),
          t['com.affine.payment.benefit-6']({ capacity: '3' }),
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
          t['com.affine.payment.benefit-1'](),
          t['com.affine.payment.benefit-2'](),
          t['com.affine.payment.benefit-3'](),
          t['com.affine.payment.benefit-4']({ capacity: '100GB' }),
          t['com.affine.payment.benefit-5']({ capacity: '100M' }),
          t['com.affine.payment.benefit-6']({ capacity: '10' }),
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
          t['com.affine.payment.dynamic-benefit-1'](),
          t['com.affine.payment.dynamic-benefit-2'](),
          t['com.affine.payment.dynamic-benefit-3'](),
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
          t['com.affine.payment.dynamic-benefit-4'](),
          t['com.affine.payment.dynamic-benefit-5'](),
        ],
      },
    ],
  ]);
}

export const PlanCard = (props: PlanCardProps) => {
  const { detail, subscription, recurring } = props;
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;

  const isCurrent = loggedIn && detail.plan === currentPlan;

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
  onNotify,
}: PlanCardProps) => {
  const t = useAFFiNEI18N();
  const loggedIn = useCurrentLoginStatus() === 'authenticated';
  const currentPlan = subscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring = subscription?.recurring;

  const mutateAndNotify = useCallback(
    (sub: Parameters<SubscriptionMutator>[0]) => {
      onSubscriptionUpdate?.(sub);
      onNotify?.({ detail, recurring });
    },
    [onSubscriptionUpdate, onNotify, detail, recurring]
  );

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
          ? t['com.affine.payment.sign-up-free']()
          : t['com.affine.payment.buy-pro']()}
      </SignUpAction>
    );
  }

  const isCanceled = !!subscription?.canceledAt;
  const isFree = detail.plan === SubscriptionPlan.Free;
  const isCurrent =
    detail.plan === currentPlan &&
    (isFree
      ? true
      : currentRecurring === recurring &&
        subscription?.status === SubscriptionStatus.Active);

  // is current
  if (isCurrent) {
    return isCanceled ? (
      <ResumeButton onSubscriptionUpdate={mutateAndNotify} />
    ) : (
      <CurrentPlan />
    );
  }

  if (isFree) {
    return (
      <Downgrade disabled={isCanceled} onSubscriptionUpdate={mutateAndNotify} />
    );
  }

  return currentPlan === detail.plan ? (
    <ChangeRecurring
      from={currentRecurring as SubscriptionRecurring}
      to={recurring as SubscriptionRecurring}
      due={subscription?.nextBillAt || ''}
      onSubscriptionUpdate={mutateAndNotify}
      disabled={isCanceled}
    />
  ) : (
    <Upgrade
      recurring={recurring as SubscriptionRecurring}
      onSubscriptionUpdate={mutateAndNotify}
    />
  );
};

const CurrentPlan = () => {
  const t = useAFFiNEI18N();
  return (
    <Button className={styles.planAction}>
      {t['com.affine.payment.current-plan']()}
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
  const [open, setOpen] = useState(false);

  const tooltipContent = disabled
    ? t['com.affine.payment.downgraded-tooltip']()
    : null;

  return (
    <CancelAction
      open={open}
      onOpenChange={setOpen}
      onSubscriptionUpdate={onSubscriptionUpdate}
    >
      <Tooltip content={tooltipContent} rootOptions={{ delayDuration: 0 }}>
        <div className={styles.planAction}>
          <Button
            className={styles.planAction}
            type="primary"
            onClick={() => setOpen(true)}
            disabled={disabled}
          >
            {t['com.affine.payment.downgrade']()}
          </Button>
        </div>
      </Tooltip>
    </CancelAction>
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
        {t['com.affine.payment.contact-sales']()}
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

  // allow replay request on network error until component unmount
  const idempotencyKey = useMemo(() => `${nanoid()}-${recurring}`, [recurring]);

  const onClose = useCallback(() => {
    newTabRef.current = null;
    onSubscriptionUpdate();
  }, [onSubscriptionUpdate]);

  const [, openPaymentDisableModal] = useAtom(openPaymentDisableAtom);
  const upgrade = useAsyncCallback(async () => {
    if (!runtimeConfig.enablePayment) {
      openPaymentDisableModal(true);
      return;
    }

    if (newTabRef.current) {
      newTabRef.current.focus();
    } else {
      await trigger(
        { recurring, idempotencyKey },
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
  }, [openPaymentDisableModal, trigger, recurring, idempotencyKey, onClose]);

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
      {t['com.affine.payment.upgrade']()}
    </Button>
  );
};

const ChangeRecurring = ({
  from,
  to,
  disabled,
  due,
  onSubscriptionUpdate,
}: {
  from: SubscriptionRecurring;
  to: SubscriptionRecurring;
  disabled?: boolean;
  due: string;
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  // allow replay request on network error until component unmount or success
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const { isMutating, trigger } = useMutation({
    mutation: updateSubscriptionMutation,
  });

  const change = useAsyncCallback(async () => {
    await trigger(
      { recurring: to, idempotencyKey },
      {
        onSuccess: data => {
          // refresh idempotency key
          setIdempotencyKey(nanoid());
          onSubscriptionUpdate(data.updateSubscriptionRecurring);
        },
      }
    );
  }, [trigger, to, idempotencyKey, onSubscriptionUpdate]);

  const changeCurringContent = (
    <Trans values={{ from, to, due }} className={styles.downgradeContent}>
      You are changing your <span className={styles.textEmphasis}>{from}</span>{' '}
      subscription to <span className={styles.textEmphasis}>{to}</span>{' '}
      subscription. This change will take effect in the next billing cycle, with
      an effective date of{' '}
      <span className={styles.textEmphasis}>
        {new Date(due).toLocaleDateString()}
      </span>
      .
    </Trans>
  );

  return (
    <>
      <Button
        className={styles.planAction}
        type="primary"
        onClick={() => setOpen(true)}
        disabled={disabled || isMutating}
        loading={isMutating}
      >
        {t['com.affine.payment.change-to']({ to })}
      </Button>

      <ConfirmLoadingModal
        type={'change'}
        loading={isMutating}
        open={open}
        onConfirm={change}
        onOpenChange={setOpen}
        content={changeCurringContent}
      />
    </>
  );
};

const SignUpAction = ({ children }: PropsWithChildren) => {
  const setOpen = useSetAtom(authAtom);

  const onClickSignIn = useCallback(() => {
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

const ResumeButton = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <ResumeAction
      open={open}
      onOpenChange={setOpen}
      onSubscriptionUpdate={onSubscriptionUpdate}
    >
      <Button
        className={styles.planAction}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => setOpen(true)}
      >
        {hovered
          ? t['com.affine.payment.resume-renewal']()
          : t['com.affine.payment.current-plan']()}
      </Button>
    </ResumeAction>
  );
};
