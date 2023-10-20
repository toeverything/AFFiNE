import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import {
  cancelSubscriptionMutation,
  createCustomerPortalMutation,
  type InvoicesQuery,
  invoicesQuery,
  InvoiceStatus,
  pricesQuery,
  resumeSubscriptionMutation,
  SubscriptionPlan,
  subscriptionQuery,
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback, useEffect } from 'react';

import { openSettingModalAtom } from '../../../../../atoms';
import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import * as styles from './style.css';

export const BillingSettings = () => {
  const status = useCurrentLoginStatus();

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <>
      <SettingHeader
        title="Billing"
        subtitle="Manage your billing information and invoices."
      />
      {/* TODO: loading fallback */}
      <Suspense>
        <SettingWrapper title="information">
          <SubscriptionSettings />
        </SettingWrapper>
      </Suspense>
      {/* TODO: loading fallback */}
      <Suspense>
        <SettingWrapper title="Billing history">
          <BillingHistory />
        </SettingWrapper>
      </Suspense>
    </>
  );
};

const SubscriptionSettings = () => {
  const { data: subscriptionQueryResult } = useQuery({
    query: subscriptionQuery,
  });
  const { data: pricesQueryResult } = useQuery({
    query: pricesQuery,
  });

  const subscription = subscriptionQueryResult.currentUser?.subscription;
  const plan = subscription?.plan ?? SubscriptionPlan.Free;
  const recurring = subscription?.recurring ?? SubscriptionRecurring.Monthly;

  const price = pricesQueryResult.prices.find(price => price.plan === plan);
  const amount =
    plan === SubscriptionPlan.Free
      ? '0'
      : price
      ? recurring === SubscriptionRecurring.Monthly
        ? String(price.amount / 100)
        : (price.yearlyAmount / 100 / 12).toFixed(2)
      : '?';

  return (
    <div className={styles.subscription}>
      <div className={styles.planCard}>
        <div className={styles.currentPlan}>
          <SettingRow
            spreadCol={false}
            name="Current Plan"
            desc={
              <p>
                You are current on the{' '}
                <a>
                  {/* TODO: Action */}
                  {plan} plan
                </a>
                .
              </p>
            }
          />
          <PlanAction plan={plan} />
        </div>
        <p className={styles.planPrice}>${amount}/month</p>
      </div>
      {subscription?.status === SubscriptionStatus.Active && (
        <>
          <SettingRow
            className={styles.paymentMethod}
            name="Payment Method"
            desc="Provided by Stripe."
          >
            <PaymentMethodUpdater />
          </SettingRow>
          {subscription.nextBillAt && (
            <SettingRow
              name="Renew Date"
              desc={`Next billing date: ${new Date(
                subscription.nextBillAt
              ).toLocaleDateString()}`}
            />
          )}
          {subscription.canceledAt ? (
            <SettingRow
              name="Expiration Date"
              desc={`Your subscription is valid until ${new Date(
                subscription.end
              ).toLocaleDateString()}`}
            >
              <ResumeSubscription />
            </SettingRow>
          ) : (
            <SettingRow
              className="dangerous-setting"
              name="Cancel Subscription"
              desc={`Subscription cancelled, your pro account will expire on ${new Date(
                subscription.end
              ).toLocaleDateString()}`}
            >
              <CancelSubscription />
            </SettingRow>
          )}
        </>
      )}
    </div>
  );
};

const PlanAction = ({ plan }: { plan: string }) => {
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const gotoPlansSetting = useCallback(() => {
    setOpenSettingModalAtom({
      open: true,
      activeTab: 'plans',
      workspaceId: null,
    });
  }, [setOpenSettingModalAtom]);

  return (
    <Button
      className={styles.planAction}
      type="primary"
      onClick={gotoPlansSetting}
    >
      {plan === SubscriptionPlan.Free ? 'Upgrade' : 'Change Plan'}
    </Button>
  );
};

const PaymentMethodUpdater = () => {
  // TODO: open stripe customer portal
  const { isMutating, trigger, data } = useMutation({
    mutation: createCustomerPortalMutation,
  });

  const update = useCallback(() => {
    trigger();
  }, [trigger]);

  useEffect(() => {
    if (data?.createCustomerPortal) {
      window.open(data.createCustomerPortal, '_blank', 'noopener noreferrer');
    }
  }, [data]);

  return (
    <Button onClick={update} loading={isMutating} disabled={isMutating}>
      Update
    </Button>
  );
};

const ResumeSubscription = () => {
  const { isMutating, trigger } = useMutation({
    mutation: resumeSubscriptionMutation,
  });

  const resume = useCallback(() => {
    trigger();
  }, [trigger]);

  return (
    <Button onClick={resume} loading={isMutating} disabled={isMutating}>
      Resume
    </Button>
  );
};

const CancelSubscription = () => {
  const { isMutating, trigger } = useMutation({
    mutation: cancelSubscriptionMutation,
  });

  const cancel = useCallback(() => {
    trigger();
  }, [trigger]);

  return (
    <IconButton
      icon={<ArrowRightSmallIcon />}
      disabled={isMutating}
      loading={isMutating}
      onClick={cancel /* TODO: popup confirmation modal instead */}
    />
  );
};

const BillingHistory = () => {
  const { data: invoicesQueryResult } = useQuery({
    query: invoicesQuery,
    variables: {
      skip: 0,
      take: 12,
    },
  });

  const invoices = invoicesQueryResult.currentUser?.invoices ?? [];

  return (
    <div className={styles.billingHistory}>
      {invoices.length === 0 ? (
        <p className={styles.noInvoice}>There are no invoices to display.</p>
      ) : (
        // TODO: pagination
        invoices.map(invoice => (
          <InvoiceLine key={invoice.id} invoice={invoice} />
        ))
      )}
    </div>
  );
};

const InvoiceLine = ({
  invoice,
}: {
  invoice: NonNullable<InvoicesQuery['currentUser']>['invoices'][0];
}) => {
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
      desc={`${invoice.status === InvoiceStatus.Paid ? 'Paid' : ''} $${
        invoice.amount / 100
      }`}
    >
      <Button onClick={open}>View Invoice</Button>
    </SettingRow>
  );
};
