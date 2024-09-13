import { Skeleton } from '@affine/component';
import { Pagination } from '@affine/component/member-components';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Button, IconButton } from '@affine/component/ui/button';
import { Loading } from '@affine/component/ui/loading';
import { getUpgradeQuestionnaireLink } from '@affine/core/components/hooks/affine/use-subscription-notify';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import {
  AuthService,
  InvoicesService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { InvoicesQuery } from '@affine/graphql';
import {
  createCustomerPortalMutation,
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
  UserFriendlyError,
} from '@affine/graphql';
import { i18nTime, Trans, useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '../../../../../components/hooks/use-mutation';
import { popupWindow } from '../../../../../utils';
import {
  openSettingModalAtom,
  type PlansScrollAnchor,
} from '../../../../atoms';
import { CancelAction, ResumeAction } from '../plans/actions';
import { AICancel, AIResume, AISubscribe } from '../plans/ai/actions';
import { BelieverCard } from '../plans/lifetime/believer-card';
import { BelieverBenefits } from '../plans/lifetime/benefits';
import * as styles from './style.css';

enum DescriptionI18NKey {
  Basic = 'com.affine.payment.billing-setting.current-plan.description',
  Monthly = 'com.affine.payment.billing-setting.current-plan.description.monthly',
  Yearly = 'com.affine.payment.billing-setting.current-plan.description.yearly',
  Lifetime = 'com.affine.payment.billing-setting.current-plan.description.lifetime',
}

const getMessageKey = (
  plan: SubscriptionPlan,
  recurring: SubscriptionRecurring
): DescriptionI18NKey => {
  if (plan !== SubscriptionPlan.Pro) {
    return DescriptionI18NKey.Basic;
  }
  return DescriptionI18NKey[recurring];
};

export const BillingSettings = () => {
  const t = useI18n();

  return (
    <>
      <SettingHeader
        title={t['com.affine.payment.billing-setting.title']()}
        subtitle={t['com.affine.payment.billing-setting.subtitle']()}
      />
      <SettingWrapper
        title={t['com.affine.payment.billing-setting.information']()}
      >
        <SubscriptionSettings />
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.payment.billing-setting.history']()}>
        <BillingHistory />
      </SettingWrapper>
    </>
  );
};

const SubscriptionSettings = () => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const proPrice = useLiveData(subscriptionService.prices.proPrice$);
  const isBeliever = useLiveData(subscriptionService.subscription.isBeliever$);

  const [openCancelModal, setOpenCancelModal] = useState(false);
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const currentPlan = proSubscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring =
    proSubscription?.recurring ?? SubscriptionRecurring.Monthly;

  const openPlans = useCallback(
    (scrollAnchor?: PlansScrollAnchor) => {
      track.$.settingsPanel.billing.viewPlans();
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'plans',
        scrollAnchor: scrollAnchor,
      });
    },
    [setOpenSettingModalAtom]
  );
  const gotoCloudPlansSetting = useCallback(
    () => openPlans('cloudPricingPlan'),
    [openPlans]
  );
  const gotoAiPlanSetting = useCallback(
    () => openPlans('aiPricingPlan'),
    [openPlans]
  );

  const amount = proSubscription
    ? proPrice
      ? proSubscription.recurring === SubscriptionRecurring.Monthly
        ? String((proPrice.amount ?? 0) / 100)
        : String((proPrice.yearlyAmount ?? 0) / 100)
      : '?'
    : '0';

  return (
    <div className={styles.subscription}>
      <AIPlanCard onClick={gotoAiPlanSetting} />
      {/* loaded  */}
      {proSubscription !== null ? (
        isBeliever ? (
          <BelieverIdentifier onOpenPlans={gotoCloudPlansSetting} />
        ) : (
          <div className={styles.planCard}>
            <div className={styles.currentPlan}>
              <SettingRow
                spreadCol={false}
                name={t['com.affine.payment.billing-setting.current-plan']()}
                desc={
                  <Trans
                    i18nKey={getMessageKey(currentPlan, currentRecurring)}
                    values={{
                      planName: currentPlan,
                    }}
                    components={{
                      1: (
                        <span
                          onClick={gotoCloudPlansSetting}
                          className={styles.currentPlanName}
                        />
                      ),
                    }}
                  />
                }
              />
              <PlanAction
                plan={currentPlan}
                gotoPlansSetting={gotoCloudPlansSetting}
              />
            </div>
            <p className={styles.planPrice}>
              ${amount}
              <span className={styles.billingFrequency}>
                /
                {currentRecurring === SubscriptionRecurring.Monthly
                  ? t['com.affine.payment.billing-setting.month']()
                  : t['com.affine.payment.billing-setting.year']()}
              </span>
            </p>
          </div>
        )
      ) : (
        <SubscriptionSettingSkeleton />
      )}

      <TypeFormLink />

      {proSubscription !== null ? (
        proSubscription?.status === SubscriptionStatus.Active && (
          <>
            <SettingRow
              className={styles.paymentMethod}
              name={t['com.affine.payment.billing-setting.payment-method']()}
              desc={t[
                'com.affine.payment.billing-setting.payment-method.description'
              ]()}
            >
              <PaymentMethodUpdater />
            </SettingRow>
            {proSubscription.nextBillAt && (
              <SettingRow
                name={t['com.affine.payment.billing-setting.renew-date']()}
                desc={t[
                  'com.affine.payment.billing-setting.renew-date.description'
                ]({
                  renewDate: new Date(
                    proSubscription.nextBillAt
                  ).toLocaleDateString(),
                })}
              />
            )}
            {isBeliever ? null : proSubscription.end &&
              proSubscription.canceledAt ? (
              <SettingRow
                name={t['com.affine.payment.billing-setting.expiration-date']()}
                desc={t[
                  'com.affine.payment.billing-setting.expiration-date.description'
                ]({
                  expirationDate: new Date(
                    proSubscription.end
                  ).toLocaleDateString(),
                })}
              >
                <ResumeSubscription />
              </SettingRow>
            ) : (
              <CancelAction
                open={openCancelModal}
                onOpenChange={setOpenCancelModal}
              >
                <SettingRow
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setOpenCancelModal(true);
                  }}
                  className="dangerous-setting"
                  name={t[
                    'com.affine.payment.billing-setting.cancel-subscription'
                  ]()}
                  desc={t[
                    'com.affine.payment.billing-setting.cancel-subscription.description'
                  ]()}
                >
                  <CancelSubscription />
                </SettingRow>
              </CancelAction>
            )}
          </>
        )
      ) : (
        <SubscriptionSettingSkeleton />
      )}
    </div>
  );
};

const TypeFormLink = () => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  const authService = useService(AuthService);

  const pro = useLiveData(subscriptionService.subscription.pro$);
  const ai = useLiveData(subscriptionService.subscription.ai$);
  const account = useLiveData(authService.session.account$);

  if (!account) return null;
  if (!pro && !ai) return null;

  const plan = [];
  if (pro) plan.push(SubscriptionPlan.Pro);
  if (ai) plan.push(SubscriptionPlan.AI);

  const link = getUpgradeQuestionnaireLink({
    name: account.info?.name,
    id: account.id,
    email: account.email,
    recurring: pro?.recurring ?? ai?.recurring ?? SubscriptionRecurring.Yearly,
    plan,
  });

  return (
    <SettingRow
      className={styles.paymentMethod}
      name={t['com.affine.payment.billing-type-form.title']()}
      desc={t['com.affine.payment.billing-type-form.description']()}
    >
      <a target="_blank" href={link} rel="noreferrer">
        <Button>{t['com.affine.payment.billing-type-form.go']()}</Button>
      </a>
    </SettingRow>
  );
};

const BelieverIdentifier = ({ onOpenPlans }: { onOpenPlans?: () => void }) => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  const readableLifetimePrice = useLiveData(
    subscriptionService.prices.readableLifetimePrice$
  );

  if (!readableLifetimePrice) return null;

  return (
    <BelieverCard type={2} style={{ borderRadius: 8, padding: 12 }}>
      <header className={styles.believerHeader}>
        <div>
          <div className={styles.believerTitle}>
            {t['com.affine.payment.billing-setting.believer.title']()}
          </div>
          <div className={styles.believerSubtitle}>
            <Trans
              i18nKey={
                'com.affine.payment.billing-setting.believer.description'
              }
              components={{
                a: <a href="#" onClick={onOpenPlans} />,
              }}
            />
          </div>
        </div>
        <div className={styles.believerPriceWrapper}>
          <div className={styles.believerPrice}>{readableLifetimePrice}</div>
          <div className={styles.believerPriceCaption}>
            {t['com.affine.payment.billing-setting.believer.price-caption']()}
          </div>
        </div>
      </header>
      <BelieverBenefits />
    </BelieverCard>
  );
};

const AIPlanCard = ({ onClick }: { onClick: () => void }) => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);
  const price = useLiveData(subscriptionService.prices.aiPrice$);
  const subscription = useLiveData(subscriptionService.subscription.ai$);

  const priceReadable = price?.yearlyAmount
    ? `$${(price.yearlyAmount / 100).toFixed(2)}`
    : '?';
  const priceFrequency = t['com.affine.payment.billing-setting.year']();

  if (subscription === null) {
    return <Skeleton height={100} />;
  }

  const billingTip =
    subscription === undefined ? (
      <Trans
        i18nKey={'com.affine.payment.billing-setting.ai.free-desc'}
        components={{
          a: (
            <a href="#" onClick={onClick} className={styles.currentPlanName} />
          ),
        }}
      />
    ) : subscription?.nextBillAt ? (
      t['com.affine.payment.ai.billing-tip.next-bill-at']({
        due: i18nTime(subscription.nextBillAt, {
          absolute: { accuracy: 'day' },
        }),
      })
    ) : subscription?.canceledAt && subscription.end ? (
      t['com.affine.payment.ai.billing-tip.end-at']({
        end: i18nTime(subscription.end, { absolute: { accuracy: 'day' } }),
      })
    ) : null;

  return (
    <div className={styles.planCard} style={{ marginBottom: 24 }}>
      <div className={styles.currentPlan}>
        <SettingRow
          spreadCol={false}
          name={t['com.affine.payment.billing-setting.ai-plan']()}
          desc={billingTip}
        />
        {price?.yearlyAmount ? (
          subscription ? (
            subscription.canceledAt ? (
              <AIResume className={styles.planAction} />
            ) : (
              <AICancel className={styles.planAction} />
            )
          ) : (
            <AISubscribe className={styles.planAction}>
              {t['com.affine.payment.billing-setting.ai.purchase']()}
            </AISubscribe>
          )
        ) : null}
      </div>
      <p className={styles.planPrice}>
        {subscription ? priceReadable : '$0'}
        <span className={styles.billingFrequency}>/{priceFrequency}</span>
      </p>
    </div>
  );
};

const PlanAction = ({
  plan,
  gotoPlansSetting,
}: {
  plan: string;
  gotoPlansSetting: () => void;
}) => {
  const t = useI18n();

  return (
    <Button
      className={styles.planAction}
      variant="primary"
      onClick={gotoPlansSetting}
    >
      {plan === SubscriptionPlan.Pro
        ? t['com.affine.payment.billing-setting.change-plan']()
        : t['com.affine.payment.billing-setting.upgrade']()}
    </Button>
  );
};

const PaymentMethodUpdater = () => {
  const { isMutating, trigger } = useMutation({
    mutation: createCustomerPortalMutation,
  });
  const t = useI18n();

  const update = useAsyncCallback(async () => {
    await trigger(null, {
      onSuccess: data => {
        popupWindow(data.createCustomerPortal);
      },
    });
  }, [trigger]);

  return (
    <Button onClick={update} loading={isMutating} disabled={isMutating}>
      {t['com.affine.payment.billing-setting.update']()}
    </Button>
  );
};

const ResumeSubscription = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  const subscription = useService(SubscriptionService).subscription;
  const handleClick = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <ResumeAction open={open} onOpenChange={setOpen}>
      <Button
        onClick={handleClick}
        data-event-props="$.settingsPanel.plans.resumeSubscription"
        data-event-args-type={subscription.pro$.value?.plan}
        data-event-args-category={subscription.pro$.value?.recurring}
      >
        {t['com.affine.payment.billing-setting.resume-subscription']()}
      </Button>
    </ResumeAction>
  );
};

const CancelSubscription = ({ loading }: { loading?: boolean }) => {
  return (
    <IconButton
      style={{ pointerEvents: 'none' }}
      disabled={loading}
      loading={loading}
    >
      <ArrowRightSmallIcon />
    </IconButton>
  );
};

const BillingHistory = () => {
  const t = useI18n();

  const invoicesService = useService(InvoicesService);
  const pageInvoices = useLiveData(invoicesService.invoices.pageInvoices$);
  const invoiceCount = useLiveData(invoicesService.invoices.invoiceCount$);
  const isLoading = useLiveData(invoicesService.invoices.isLoading$);
  const error = useLiveData(invoicesService.invoices.error$);
  const pageNum = useLiveData(invoicesService.invoices.pageNum$);

  useEffect(() => {
    invoicesService.invoices.revalidate();
  }, [invoicesService]);

  const handlePageChange = useCallback(
    (_: number, pageNum: number) => {
      invoicesService.invoices.setPageNum(pageNum);
      invoicesService.invoices.revalidate();
    },
    [invoicesService]
  );

  if (invoiceCount === undefined) {
    if (isLoading) {
      return <BillingHistorySkeleton />;
    } else {
      return (
        <span style={{ color: cssVar('errorColor') }}>
          {error
            ? UserFriendlyError.fromAnyError(error).message
            : 'Failed to load members'}
        </span>
      );
    }
  }

  return (
    <div className={styles.history}>
      <div className={styles.historyContent}>
        {invoiceCount === 0 ? (
          <p className={styles.noInvoice}>
            {t['com.affine.payment.billing-setting.no-invoice']()}
          </p>
        ) : (
          pageInvoices?.map(invoice => (
            <InvoiceLine key={invoice.id} invoice={invoice} />
          ))
        )}
      </div>

      {invoiceCount > invoicesService.invoices.PAGE_SIZE && (
        <Pagination
          totalCount={invoiceCount}
          countPerPage={invoicesService.invoices.PAGE_SIZE}
          pageNum={pageNum}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

const InvoiceLine = ({
  invoice,
}: {
  invoice: NonNullable<InvoicesQuery['currentUser']>['invoices'][0];
}) => {
  const t = useI18n();

  const open = useCallback(() => {
    if (invoice.link) {
      popupWindow(invoice.link);
    }
  }, [invoice.link]);

  const planText =
    invoice.plan === SubscriptionPlan.AI
      ? 'AFFiNE AI'
      : invoice.plan === SubscriptionPlan.Pro
        ? invoice.recurring === SubscriptionRecurring.Lifetime
          ? 'AFFiNE Cloud Believer'
          : 'AFFiNE Cloud'
        : null;

  return (
    <SettingRow
      key={invoice.id}
      name={new Date(invoice.createdAt).toLocaleDateString()}
      desc={`${
        invoice.status === InvoiceStatus.Paid
          ? t['com.affine.payment.billing-setting.paid']()
          : ''
      } $${invoice.amount / 100} - ${planText}`}
    >
      <Button onClick={open}>
        {t['com.affine.payment.billing-setting.view-invoice']()}
      </Button>
    </SettingRow>
  );
};

const SubscriptionSettingSkeleton = () => {
  const t = useI18n();
  return (
    <SettingWrapper
      title={t['com.affine.payment.billing-setting.information']()}
    >
      <div className={styles.subscriptionSettingSkeleton}>
        <Skeleton variant="rounded" height="104px" />
        <Skeleton variant="rounded" height="46px" />
      </div>
    </SettingWrapper>
  );
};

const BillingHistorySkeleton = () => {
  const t = useI18n();
  return (
    <SettingWrapper title={t['com.affine.payment.billing-setting.history']()}>
      <div className={styles.billingHistorySkeleton}>
        <Loading />
      </div>
    </SettingWrapper>
  );
};
