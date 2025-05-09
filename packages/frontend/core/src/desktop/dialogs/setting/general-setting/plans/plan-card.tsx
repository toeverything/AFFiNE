import { Button, type ButtonProps } from '@affine/component/ui/button';
import { Tooltip } from '@affine/component/ui/tooltip';
import { generateSubscriptionCallbackLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  AuthService,
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { UrlService } from '@affine/core/modules/url';
import {
  type CreateCheckoutSessionInput,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  SubscriptionVariant,
} from '@affine/graphql';
import { Trans, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import type { PropsWithChildren } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { CancelAction, ResumeAction } from './actions';
import { CheckoutSlot } from './checkout-slot';
import type { DynamicPrice, FixedPrice } from './cloud-plans';
import { ConfirmLoadingModal } from './modals';
import * as styles from './style.css';

interface PlanCardProps {
  detail: FixedPrice | DynamicPrice;
  recurring: SubscriptionRecurring;
}

export const PlanCard = (props: PlanCardProps) => {
  const { detail, recurring } = props;
  const loggedIn =
    useLiveData(useService(AuthService).session.status$) === 'authenticated';
  const subscriptionService = useService(SubscriptionService);
  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const currentPlan = proSubscription?.plan ?? SubscriptionPlan.Free;

  const isCurrent =
    loggedIn &&
    detail.plan === currentPlan &&
    recurring === proSubscription?.recurring;
  const isPro = detail.plan === SubscriptionPlan.Pro;

  return (
    <div
      data-current={isCurrent}
      key={detail.plan}
      className={isPro ? styles.proPlanCard : styles.planCard}
    >
      <div className={styles.planCardBorderMock} />
      <div className={styles.planTitle}>
        <div style={{ paddingBottom: 12 }}>
          <section className={styles.planTitleName}>{detail.name}</section>
          <section className={styles.planTitleDescription}>
            {detail.description}
          </section>
          <section className={styles.planTitleTitle}>
            {detail.titleRenderer(recurring, detail as any)}
          </section>
        </div>
        <ActionButton {...props} />
      </div>
      <div className={styles.planBenefits}>
        {Object.entries(detail.benefits).map(([groupName, benefitList]) => {
          return (
            <ul className={styles.planBenefitGroup} key={groupName}>
              <section className={styles.planBenefitGroupTitle}>
                {groupName}:
              </section>
              {benefitList.map(({ icon, title }, index) => {
                return (
                  <li className={styles.planBenefit} key={index}>
                    <div className={styles.planBenefitIcon}>
                      {icon ?? <DoneIcon />}
                    </div>
                    <div className={styles.planBenefitText}>{title}</div>
                  </li>
                );
              })}
            </ul>
          );
        })}
      </div>
    </div>
  );
};

const getSignUpText = (
  plan: SubscriptionPlan,
  t: ReturnType<typeof useI18n>
) => {
  switch (plan) {
    case SubscriptionPlan.Free:
      return t['com.affine.payment.sign-up-free']();
    case SubscriptionPlan.Team:
      return t['com.affine.payment.upgrade']();
    default:
      return t['com.affine.payment.buy-pro']();
  }
};

const ActionButton = ({ detail, recurring }: PlanCardProps) => {
  const t = useI18n();
  const loggedIn =
    useLiveData(useService(AuthService).session.status$) === 'authenticated';
  const subscriptionService = useService(SubscriptionService);
  const isBeliever = useLiveData(subscriptionService.subscription.isBeliever$);
  const primarySubscription = useLiveData(
    subscriptionService.subscription.pro$
  );
  const currentPlan = primarySubscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring = primarySubscription?.recurring;
  const isOnetime = useLiveData(subscriptionService.subscription.isOnetimePro$);
  const isFree = detail.plan === SubscriptionPlan.Free;

  const signUpText = useMemo(
    () => getSignUpText(detail.plan, t),
    [detail.plan, t]
  );

  // branches:
  //  if contact                                => 'Contact Sales'
  //  if not signed in:
  //    if free                                 => 'Sign up free'
  //    if team                                 => 'Upgrade'
  //    else                                    => 'Buy Pro'
  //  else
  //    if team                                 => 'Start 14-day free trial'
  //    if isBeliever                           => 'Included in Lifetime'
  //    if onetime
  //      if free                               => 'Included in Pro'
  //      else                                  => 'Redeem Code'
  //    if isCurrent
  //      if canceled                           => 'Resume'
  //      else                                  => 'Current Plan'
  //    if free                                 => 'Downgrade'
  //    if currentRecurring !== recurring       => 'Change to {recurring} Billing'
  //    else                                    => 'Upgrade'

  // team
  if (detail.plan === SubscriptionPlan.Team) {
    return <UpgradeToTeam recurring={recurring} />;
  }

  // not signed in
  if (!loggedIn) {
    return <SignUpAction>{signUpText}</SignUpAction>;
  }

  // lifetime
  if (isBeliever) {
    return (
      <Button className={styles.planAction} disabled>
        {t['com.affine.payment.cloud.lifetime.included']()}
      </Button>
    );
  }

  // onetime
  if (isOnetime) {
    return isFree ? (
      <Button className={styles.planAction} disabled>
        {t['com.affine.payment.cloud.onetime.included']()}
      </Button>
    ) : (
      <RedeemCode recurring={recurring} />
    );
  }

  const isCanceled = !!primarySubscription?.canceledAt;
  const isCurrent =
    detail.plan === currentPlan &&
    (isFree
      ? true
      : currentRecurring === recurring &&
        primarySubscription?.status === SubscriptionStatus.Active);

  // is current
  if (isCurrent) {
    return isCanceled ? <ResumeButton /> : <CurrentPlan />;
  }

  if (isFree) {
    return <Downgrade disabled={isCanceled} />;
  }

  return currentPlan === detail.plan ? (
    <ChangeRecurring
      from={currentRecurring as SubscriptionRecurring}
      to={recurring as SubscriptionRecurring}
      due={primarySubscription?.nextBillAt || ''}
      disabled={isCanceled}
    />
  ) : (
    <Upgrade
      recurring={recurring as SubscriptionRecurring}
      plan={SubscriptionPlan.Pro}
    />
  );
};

const CurrentPlan = () => {
  const t = useI18n();
  return (
    <Button className={styles.planAction}>
      {t['com.affine.payment.current-plan']()}
    </Button>
  );
};

const Downgrade = ({ disabled }: { disabled?: boolean }) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  const tooltipContent = disabled
    ? t['com.affine.payment.downgraded-tooltip']()
    : null;

  const handleClick = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <CancelAction open={open} onOpenChange={setOpen}>
      <Tooltip content={tooltipContent} rootOptions={{ delayDuration: 0 }}>
        <div className={styles.planAction}>
          <Button
            className={styles.planAction}
            variant="primary"
            onClick={handleClick}
            disabled={disabled}
          >
            {t['com.affine.payment.downgrade']()}
          </Button>
        </div>
      </Tooltip>
    </CancelAction>
  );
};

const UpgradeToTeam = ({ recurring }: { recurring: SubscriptionRecurring }) => {
  const t = useI18n();
  const serverService = useService(ServerService);
  const urlService = useService(UrlService);
  const url = `${serverService.server.baseUrl}/upgrade-to-team?recurring=${recurring}`;
  const scheme = urlService.getClientScheme();
  const urlParams = new URLSearchParams();
  if (scheme) {
    urlParams.set('client', scheme);
  }

  return (
    <a
      className={styles.planAction}
      href={`${url}${urlParams.toString() ? `&${urlParams.toString()}` : ''}`}
      target="_blank"
      rel="noreferrer"
    >
      <Button
        className={styles.planAction}
        variant="primary"
        data-event-args-url={`${url}${urlParams.toString() ? `&${urlParams.toString()}` : ''}`}
      >
        {t['com.affine.payment.upgrade']()}
      </Button>
    </a>
  );
};

export const Upgrade = ({
  className,
  recurring,
  plan,
  workspaceId,
  children,
  checkoutInput,
  onCheckoutSuccess,
  onBeforeCheckout,
  ...btnProps
}: ButtonProps & {
  recurring: SubscriptionRecurring;
  plan: SubscriptionPlan;
  workspaceId?: string;
  checkoutInput?: Partial<CreateCheckoutSessionInput>;
  onBeforeCheckout?: () => void;
  onCheckoutSuccess?: () => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const urlService = useService(UrlService);
  const schema = urlService.getClientScheme();

  const handleBeforeCheckout = useCallback(() => {
    track.$.settingsPanel.plans.checkout({
      plan: plan,
      recurring: recurring,
    });
    onBeforeCheckout?.();
  }, [onBeforeCheckout, plan, recurring]);

  const checkoutOptions = useMemo(
    () => ({
      recurring,
      plan: plan,
      variant: null,
      coupon: null,
      successCallbackLink: generateSubscriptionCallbackLink(
        authService.session.account$.value,
        plan,
        recurring,
        workspaceId || '',
        schema
      ),
      ...checkoutInput,
    }),
    [
      authService.session.account$.value,
      checkoutInput,
      plan,
      recurring,
      schema,
      workspaceId,
    ]
  );

  return (
    <CheckoutSlot
      onBeforeCheckout={handleBeforeCheckout}
      checkoutOptions={checkoutOptions}
      onCheckoutSuccess={onCheckoutSuccess}
      renderer={props => (
        <Button
          className={clsx(styles.planAction, className)}
          variant="primary"
          {...props}
          {...btnProps}
        >
          {children ?? t['com.affine.payment.upgrade']()}
        </Button>
      )}
    />
  );
};

const ChangeRecurring = ({
  from,
  to,
  disabled,
  due,
}: {
  from: SubscriptionRecurring;
  to: SubscriptionRecurring;
  disabled?: boolean;
  due: string;
}) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  // allow replay request on network error until component unmount or success
  const [idempotencyKey, setIdempotencyKey] = useState(nanoid());
  const subscription = useService(SubscriptionService).subscription;

  const onStartChange = useCallback(() => {
    track.$.settingsPanel.plans.changeSubscriptionRecurring({
      plan: SubscriptionPlan.Pro,
      recurring: to,
    });
    setOpen(true);
  }, [to]);

  const change = useAsyncCallback(async () => {
    setIsMutating(true);
    await subscription.setSubscriptionRecurring(idempotencyKey, to);
    setIdempotencyKey(nanoid());
    setIsMutating(false);
  }, [subscription, to, idempotencyKey]);

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
        variant="primary"
        onClick={onStartChange}
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

export const SignUpAction = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => {
  const globalDialogService = useService(GlobalDialogService);

  const onClickSignIn = useCallback(() => {
    globalDialogService.open('sign-in', {});
  }, [globalDialogService]);

  return (
    <Button
      onClick={onClickSignIn}
      className={clsx(styles.planAction, className)}
      variant="primary"
    >
      {children}
    </Button>
  );
};

const ResumeButton = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const subscription = useService(SubscriptionService).subscription;

  const handleClick = useCallback(() => {
    setOpen(true);
    const pro = subscription.pro$.value;
    if (pro) {
      track.$.settingsPanel.plans.resumeSubscription({
        plan: SubscriptionPlan.Pro,
        recurring: pro.recurring,
      });
    }
  }, [subscription.pro$.value]);

  return (
    <ResumeAction open={open} onOpenChange={setOpen}>
      <Button className={styles.resumeAction} onClick={handleClick}>
        <span data-show-hover="true" className={clsx(styles.resumeContent)}>
          {t['com.affine.payment.resume-renewal']()}
        </span>
        <span data-show-hover="false" className={clsx(styles.resumeContent)}>
          {t['com.affine.payment.current-plan']()}
        </span>
      </Button>
    </ResumeAction>
  );
};

const redeemCodeCheckoutInput = { variant: SubscriptionVariant.Onetime };
export const RedeemCode = ({
  className,
  recurring = SubscriptionRecurring.Yearly,
  plan,
  children,
  ...btnProps
}: ButtonProps & {
  recurring?: SubscriptionRecurring;
  plan?: SubscriptionPlan;
}) => {
  const t = useI18n();

  return (
    <Upgrade
      recurring={recurring}
      className={className}
      checkoutInput={redeemCodeCheckoutInput}
      plan={plan ?? SubscriptionPlan.Pro}
      {...btnProps}
    >
      {children ?? t['com.affine.payment.redeem-code']()}
    </Upgrade>
  );
};
