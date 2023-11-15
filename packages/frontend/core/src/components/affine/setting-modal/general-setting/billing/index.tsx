import { Pagination } from '@affine/component/member-components';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import {
  createCustomerPortalMutation,
  getInvoicesCountQuery,
  type InvoicesQuery,
  invoicesQuery,
  InvoiceStatus,
  pricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { Skeleton } from '@mui/material';
import { Button, IconButton } from '@toeverything/components/button';
import { Loading } from '@toeverything/components/loading';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback, useMemo, useState } from 'react';

import { openSettingModalAtom } from '../../../../../atoms';
import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '../../../../../hooks/use-subscription';
import { SWRErrorBoundary } from '../../../../pure/swr-error-bundary';
import { CancelAction, ResumeAction } from '../plans/actions';
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
  const status = useCurrentLoginStatus();
  const t = useAFFiNEI18N();

  if (status !== 'authenticated') {
    return null;
  }

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
  const [subscription, mutateSubscription] = useUserSubscription();
  const [openCancelModal, setOpenCancelModal] = useState(false);

  const { data: pricesQueryResult } = useQuery({
    query: pricesQuery,
  });

  const plan = subscription?.plan ?? SubscriptionPlan.Free;
  const recurring = subscription?.recurring ?? SubscriptionRecurring.Monthly;

  const price = pricesQueryResult.prices.find(price => price.plan === plan);
  const amount =
    plan === SubscriptionPlan.Free
      ? '0'
      : price
      ? recurring === SubscriptionRecurring.Monthly
        ? String(price.amount / 100)
        : String(price.yearlyAmount / 100)
      : '?';

  const t = useAFFiNEI18N();

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const gotoPlansSetting = useCallback(() => {
    setOpenSettingModalAtom({
      open: true,
      activeTab: 'plans',
      workspaceId: null,
    });
  }, [setOpenSettingModalAtom]);

  const currentPlanDesc = useMemo(() => {
    const messageKey = getMessageKey(plan, recurring);
    return (
      <Trans
        i18nKey={messageKey}
        values={{
          planName: plan,
        }}
        components={{
          1: (
            <span
              onClick={gotoPlansSetting}
              className={styles.currentPlanName}
            />
          ),
        }}
      />
    );
  }, [plan, recurring, gotoPlansSetting]);

  return (
    <div className={styles.subscription}>
      <div className={styles.planCard}>
        <div className={styles.currentPlan}>
          <SettingRow
            spreadCol={false}
            name={t['com.affine.payment.billing-setting.current-plan']()}
            desc={currentPlanDesc}
          />
          <PlanAction plan={plan} gotoPlansSetting={gotoPlansSetting} />
        </div>
        <p className={styles.planPrice}>
          ${amount}
          <span className={styles.billingFrequency}>
            /
            {recurring === SubscriptionRecurring.Monthly
              ? t['com.affine.payment.billing-setting.month']()
              : t['com.affine.payment.billing-setting.year']()}
          </span>
        </p>
      </div>
      {subscription?.status === SubscriptionStatus.Active && (
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
          {subscription.nextBillAt && (
            <SettingRow
              name={t['com.affine.payment.billing-setting.renew-date']()}
              desc={t[
                'com.affine.payment.billing-setting.renew-date.description'
              ]({
                renewDate: new Date(
                  subscription.nextBillAt
                ).toLocaleDateString(),
              })}
            />
          )}
          {subscription.canceledAt ? (
            <SettingRow
              name={t['com.affine.payment.billing-setting.expiration-date']()}
              desc={t[
                'com.affine.payment.billing-setting.expiration-date.description'
              ]({
                expirationDate: new Date(subscription.end).toLocaleDateString(),
              })}
            >
              <ResumeSubscription onSubscriptionUpdate={mutateSubscription} />
            </SettingRow>
          ) : (
            <CancelAction
              open={openCancelModal}
              onOpenChange={setOpenCancelModal}
              onSubscriptionUpdate={mutateSubscription}
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
                ]({
                  cancelDate: new Date(subscription.end).toLocaleDateString(),
                })}
              >
                <CancelSubscription />
              </SettingRow>
            </CancelAction>
          )}
        </>
      )}
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
      {plan === SubscriptionPlan.Free
        ? t['com.affine.payment.billing-setting.upgrade']()
        : t['com.affine.payment.billing-setting.change-plan']()}
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
        window.open(data.createCustomerPortal, '_blank', 'noopener noreferrer');
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

const ResumeSubscription = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);

  return (
    <ResumeAction
      open={open}
      onOpenChange={setOpen}
      onSubscriptionUpdate={onSubscriptionUpdate}
    >
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
      window.open(invoice.link, '_blank', 'noopener noreferrer');
    }
  }, [invoice.link]);

  return (
    <SettingRow
      key={invoice.id}
      name={new Date(invoice.createdAt).toLocaleDateString()}
      // TODO: currency to format: usd => $, cny => ¥
      desc={`${
        invoice.status === InvoiceStatus.Paid
          ? t['com.affine.payment.billing-setting.paid']()
          : ''
      } $${invoice.amount / 100}`}
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
