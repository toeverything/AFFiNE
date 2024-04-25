import { Skeleton } from '@affine/component';
import { Pagination } from '@affine/component/member-components';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Button, IconButton } from '@affine/component/ui/button';
import { Loading } from '@affine/component/ui/loading';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import type { InvoicesQuery } from '@affine/graphql';
import {
  createCustomerPortalMutation,
  getInvoicesCountQuery,
  invoicesQuery,
  InvoiceStatus,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { useLiveData, useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback, useEffect, useState } from 'react';

import { openSettingModalAtom } from '../../../../../atoms';
import { useMutation } from '../../../../../hooks/use-mutation';
import { useQuery } from '../../../../../hooks/use-query';
import { SubscriptionService } from '../../../../../modules/cloud';
import {
  mixpanel,
  popupWindow,
  timestampToLocalDate,
} from '../../../../../utils';
import { SWRErrorBoundary } from '../../../../pure/swr-error-bundary';
import { CancelAction, ResumeAction } from '../plans/actions';
import { AICancel, AIResume, AISubscribe } from '../plans/ai/actions';
import * as styles from './style.css';

enum DescriptionI18NKey {
  Basic = 'com.affine.payment.billing-setting.current-plan.description',
  Monthly = 'com.affine.payment.billing-setting.current-plan.description.monthly',
  Yearly = 'com.affine.payment.billing-setting.current-plan.description.yearly',
}

const INVOICE_PAGE_SIZE = 12;

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
  const t = useAFFiNEI18N();

  return (
    <>
      <SettingHeader
        title={t['com.affine.payment.billing-setting.title']()}
        subtitle={t['com.affine.payment.billing-setting.subtitle']()}
      />
      <SWRErrorBoundary FallbackComponent={SubscriptionSettingSkeleton}>
        <Suspense fallback={<SubscriptionSettingSkeleton />}>
          <SettingWrapper
            title={t['com.affine.payment.billing-setting.information']()}
          >
            <SubscriptionSettings />
          </SettingWrapper>
        </Suspense>
      </SWRErrorBoundary>
      <SWRErrorBoundary FallbackComponent={BillingHistorySkeleton}>
        <Suspense fallback={<BillingHistorySkeleton />}>
          <SettingWrapper
            title={t['com.affine.payment.billing-setting.history']()}
          >
            <BillingHistory />
          </SettingWrapper>
        </Suspense>
      </SWRErrorBoundary>
    </>
  );
};

const SubscriptionSettings = () => {
  const t = useAFFiNEI18N();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const proPrice = useLiveData(subscriptionService.prices.proPrice$);

  const [openCancelModal, setOpenCancelModal] = useState(false);
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const currentPlan = proSubscription?.plan ?? SubscriptionPlan.Free;
  const currentRecurring =
    proSubscription?.recurring ?? SubscriptionRecurring.Monthly;

  const openPlans = useCallback(
    (scrollAnchor?: string) => {
      mixpanel.track('Button', {
        resolve: 'ChangePlan',
        currentPlan: proSubscription?.plan,
      });
      setOpenSettingModalAtom({
        open: true,
        activeTab: 'plans',
        scrollAnchor: scrollAnchor,
      });
    },
    [proSubscription?.plan, setOpenSettingModalAtom]
  );
  const gotoCloudPlansSetting = useCallback(() => openPlans(), [openPlans]);
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
      {/* loaded  */}
      {proSubscription !== null ? (
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
      ) : (
        <SubscriptionSettingSkeleton />
      )}

      <AIPlanCard onClick={gotoAiPlanSetting} />
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
            {proSubscription.canceledAt ? (
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
                  onClick={() => setOpenCancelModal(true)}
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

const AIPlanCard = ({ onClick }: { onClick: () => void }) => {
  const t = useAFFiNEI18N();
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
        due: timestampToLocalDate(subscription.nextBillAt),
      })
    ) : subscription?.canceledAt && subscription.end ? (
      t['com.affine.payment.ai.billing-tip.end-at']({
        end: timestampToLocalDate(subscription.end),
      })
    ) : null;

  return (
    <div className={styles.planCard} style={{ marginTop: 24 }}>
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
  const t = useAFFiNEI18N();

  return (
    <Button
      className={styles.planAction}
      type="primary"
      onClick={gotoPlansSetting}
    >
      {plan === SubscriptionPlan.Pro
        ? t['com.affine.payment.billing-setting.change-plan']()
        : t['com.affine.payment.billing-setting.upgrade']()}
    </Button>
  );
};

const PaymentMethodUpdater = () => {
  // TODO: open stripe customer portal
  const { isMutating, trigger } = useMutation({
    mutation: createCustomerPortalMutation,
  });
  const t = useAFFiNEI18N();

  const update = useAsyncCallback(async () => {
    await trigger(null, {
      onSuccess: data => {
        popupWindow(data.createCustomerPortal);
      },
    });
  }, [trigger]);

  return (
    <Button
      className={styles.button}
      onClick={update}
      loading={isMutating}
      disabled={isMutating}
    >
      {t['com.affine.payment.billing-setting.update']()}
    </Button>
  );
};

const ResumeSubscription = () => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);

  return (
    <ResumeAction open={open} onOpenChange={setOpen}>
      <Button className={styles.button} onClick={() => setOpen(true)}>
        {t['com.affine.payment.billing-setting.resume-subscription']()}
      </Button>
    </ResumeAction>
  );
};

const CancelSubscription = ({ loading }: { loading?: boolean }) => {
  return (
    <IconButton
      style={{ pointerEvents: 'none' }}
      icon={<ArrowRightSmallIcon />}
      disabled={loading}
      loading={loading}
    />
  );
};

const BillingHistory = () => {
  const t = useAFFiNEI18N();
  const { data: invoicesCountQueryResult } = useQuery({
    query: getInvoicesCountQuery,
  });

  const [skip, setSkip] = useState(0);

  const { data: invoicesQueryResult } = useQuery({
    query: invoicesQuery,
    variables: { skip, take: INVOICE_PAGE_SIZE },
  });

  const invoices = invoicesQueryResult.currentUser?.invoices ?? [];
  const invoiceCount = invoicesCountQueryResult.currentUser?.invoiceCount ?? 0;

  return (
    <div className={styles.history}>
      <div className={styles.historyContent}>
        {invoices.length === 0 ? (
          <p className={styles.noInvoice}>
            {t['com.affine.payment.billing-setting.no-invoice']()}
          </p>
        ) : (
          invoices.map(invoice => (
            <InvoiceLine key={invoice.id} invoice={invoice} />
          ))
        )}
      </div>

      {invoiceCount > INVOICE_PAGE_SIZE && (
        <Pagination
          totalCount={invoiceCount}
          countPerPage={INVOICE_PAGE_SIZE}
          onPageChange={skip => setSkip(skip)}
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
  const t = useAFFiNEI18N();

  const open = useCallback(() => {
    if (invoice.link) {
      popupWindow(invoice.link);
    }
  }, [invoice.link]);

  const planText =
    invoice.plan === SubscriptionPlan.AI
      ? 'AFFiNE AI'
      : invoice.plan === SubscriptionPlan.Pro
        ? 'AFFiNE Cloud'
        : null;

  return (
    <SettingRow
      key={invoice.id}
      name={new Date(invoice.createdAt).toLocaleDateString()}
      // TODO: currency to format: usd => $, cny => ¥
      desc={`${
        invoice.status === InvoiceStatus.Paid
          ? t['com.affine.payment.billing-setting.paid']()
          : ''
      } $${invoice.amount / 100} - ${planText}`}
    >
      <Button className={styles.button} onClick={open}>
        {t['com.affine.payment.billing-setting.view-invoice']()}
      </Button>
    </SettingRow>
  );
};

const SubscriptionSettingSkeleton = () => {
  const t = useAFFiNEI18N();
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
  const t = useAFFiNEI18N();
  return (
    <SettingWrapper title={t['com.affine.payment.billing-setting.history']()}>
      <div className={styles.billingHistorySkeleton}>
        <Loading />
      </div>
    </SettingWrapper>
  );
};
