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
  SubscriptionRecurring,
  SubscriptionStatus,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import { Suspense, useCallback } from 'react';

import { usePlanI18NText } from '../../../../..//hooks/use-plan-i18n-text';
import { openSettingModalAtom } from '../../../../../atoms';
import { useCurrentLoginStatus } from '../../../../../hooks/affine/use-current-login-status';
import {
  type SubscriptionMutator,
  useUserSubscription,
} from '../../../../../hooks/use-subscription';
import * as styles from './style.css';

export const BillingSettings = () => {
  const status = useCurrentLoginStatus();
  const t = useAFFiNEI18N();

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <>
      <SettingHeader
        title={t['com.affine.billing.title']()}
        subtitle={t['com.affine.billing.subtitle']()}
      />
      {/* TODO: loading fallback */}
      <Suspense>
        <SettingWrapper title={t['com.affine.billing.information']()}>
          <SubscriptionSettings />
        </SettingWrapper>
      </Suspense>
      {/* TODO: loading fallback */}
      <Suspense>
        <SettingWrapper title={t['com.affine.billing.history']()}>
          <BillingHistory />
        </SettingWrapper>
      </Suspense>
    </>
  );
};

const SubscriptionSettings = () => {
  const [subscription, mutateSubscription] = useUserSubscription();
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
        : (price.yearlyAmount / 100 / 12).toFixed(2)
      : '?';

  const t = useAFFiNEI18N();
  const planText = usePlanI18NText(plan);

  return (
    <div className={styles.subscription}>
      <div className={styles.planCard}>
        <div className={styles.currentPlan}>
          <SettingRow
            spreadCol={false}
            name={t['com.affine.billing.current-plan']()}
            desc={
              <Trans
                i18nKey="com.affine.billing.current-plan.description"
                values={{
                  planName: planText,
                }}
              >
                You are current on the <a>planName</a> plan.
              </Trans>
            }
          />
          <PlanAction plan={plan} />
        </div>
        <p className={styles.planPrice}>
          ${amount}/{t['com.affine.billing.month']()}
        </p>
      </div>
      {subscription?.status === SubscriptionStatus.Active && (
        <>
          <SettingRow
            className={styles.paymentMethod}
            name={t['com.affine.billing.payment-method']()}
            desc={t['com.affine.billing.payment-method.description']()}
          >
            <PaymentMethodUpdater />
          </SettingRow>
          {subscription.nextBillAt && (
            <SettingRow
              name={t['com.affine.billing.renew-date']()}
              desc={t['com.affine.billing.renew-date.description']({
                renewDate: new Date(
                  subscription.nextBillAt
                ).toLocaleDateString(),
              })}
            />
          )}
          {subscription.canceledAt ? (
            <SettingRow
              name={t['com.affine.billing.expiration-date']()}
              desc={t['com.affine.billing.expiration-date.description']({
                expirationDate: new Date(subscription.end).toLocaleDateString(),
              })}
            >
              <ResumeSubscription onSubscriptionUpdate={mutateSubscription} />
            </SettingRow>
          ) : (
            <SettingRow
              className="dangerous-setting"
              name={t['com.affine.billing.cancel-subscription']()}
              desc={t['com.affine.billing.cancel-subscription.description']({
                cancelDate: new Date(subscription.end).toLocaleDateString(),
              })}
            >
              <CancelSubscription onSubscriptionUpdate={mutateSubscription} />
            </SettingRow>
          )}
        </>
      )}
    </div>
  );
};

const PlanAction = ({ plan }: { plan: string }) => {
  const t = useAFFiNEI18N();
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
      {plan === SubscriptionPlan.Free
        ? t['com.affine.billing.upgrade']()
        : t['com.affine.billing.change-plan']()}
    </Button>
  );
};

const PaymentMethodUpdater = () => {
  // TODO: open stripe customer portal
  const { isMutating, trigger } = useMutation({
    mutation: createCustomerPortalMutation,
  });
  const t = useAFFiNEI18N();

  const update = useCallback(() => {
    trigger(null, {
      onSuccess: data => {
        window.open(data.createCustomerPortal, '_blank', 'noopener noreferrer');
      },
    });
  }, [trigger]);

  return (
    <Button onClick={update} loading={isMutating} disabled={isMutating}>
      {t['com.affine.billing.upgrade']()}
    </Button>
  );
};

const ResumeSubscription = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const t = useAFFiNEI18N();
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
    <Button onClick={resume} loading={isMutating} disabled={isMutating}>
      {t['com.affine.billing.resume-subscription']()}
    </Button>
  );
};

const CancelSubscription = ({
  onSubscriptionUpdate,
}: {
  onSubscriptionUpdate: SubscriptionMutator;
}) => {
  const { isMutating, trigger } = useMutation({
    mutation: cancelSubscriptionMutation,
  });

  const cancel = useCallback(() => {
    trigger(null, {
      onSuccess: data => {
        onSubscriptionUpdate(data.cancelSubscription);
      },
    });
  }, [trigger, onSubscriptionUpdate]);

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
  const t = useAFFiNEI18N();
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
        <p className={styles.noInvoice}>
          {t['com.affine.billing.no-invoice']()}
        </p>
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
          ? t['com.affine.billing.paid']()
          : ''
      } $${invoice.amount / 100}`}
    >
      <Button onClick={open}>{t['com.affine.billing.view-invoice']()}</Button>
    </SettingRow>
  );
};
