import { notify } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Button, type ButtonProps } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import type { SubscriptionType } from '@affine/core/modules/cloud/entities/subscription';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import {
  createCustomerPortalMutation,
  SubscriptionRecurring,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';

import { useMutation } from '../../../../../components/hooks/use-mutation';

const stores = new Map([
  [
    'app_store',
    { name: 'App Store', url: 'https://support.apple.com/billing' },
  ],
  [
    'play_store',
    {
      name: 'Google Play',
      url: 'https://play.google.com/store/account/subscriptions',
    },
  ],
]);

const billingRecurringLabel = {
  [SubscriptionRecurring.Lifetime]:
    'com.affine.payment.billing-setting.believer.price-caption',
  [SubscriptionRecurring.Monthly]:
    'com.affine.payment.billing-setting.subscription-billing.monthly',
  [SubscriptionRecurring.Yearly]:
    'com.affine.payment.billing-setting.subscription-billing.yearly',
} as const;

type BillingSource = Pick<SubscriptionType, 'provider' | 'iapStore'>;

const getStore = ({ provider, iapStore }: BillingSource) =>
  provider === 'revenuecat' && iapStore ? stores.get(iapStore) : undefined;

export const SubscriptionSourceRow = ({
  source,
}: {
  source: BillingSource & { recurring: SubscriptionRecurring | null };
}) => {
  const t = useI18n();
  const name =
    source.provider === 'stripe'
      ? 'Stripe'
      : (getStore(source)?.name ?? source.provider);

  if (!name) return null;

  return (
    <SettingRow
      name={name}
      desc={
        source.recurring
          ? t[billingRecurringLabel[source.recurring]]()
          : undefined
      }
    >
      <ManageSubscriptionButton source={source} />
    </SettingRow>
  );
};

type ManagementButtonProps = Pick<ButtonProps, 'className' | 'variant'> & {
  inCardView?: boolean;
};

export const ManageSubscriptionButton = ({
  source,
  ...props
}: ManagementButtonProps & { source: BillingSource }) => {
  if (source.provider === 'stripe') {
    return <StripePortalButton {...props} />;
  }
  const store = getStore(source);
  return store ? <StoreManagementButton {...props} {...store} /> : null;
};

const StoreManagementButton = ({
  url,
  name,
  inCardView,
  ...props
}: ManagementButtonProps & { url: string; name: string }) => {
  const urlService = useService(UrlService);
  const t = useI18n();
  return (
    <Button {...props} onClick={() => urlService.openExternal(url)}>
      {inCardView
        ? name
        : t['com.affine.payment.billing-setting.payment-method.go']()}
    </Button>
  );
};

const StripePortalButton = ({
  inCardView,
  ...props
}: ManagementButtonProps) => {
  const { isMutating, trigger } = useMutation({
    mutation: createCustomerPortalMutation,
  });
  const urlService = useService(UrlService);
  const t = useI18n();

  const update = useAsyncCallback(async () => {
    await trigger(null, {
      onSuccess: data => {
        urlService.openExternal(data.createCustomerPortal);
      },
    }).catch(e => {
      notify.error(UserFriendlyError.fromAny(e));
    });
  }, [trigger, urlService]);

  return (
    <Button
      {...props}
      onClick={update}
      loading={isMutating}
      disabled={isMutating}
    >
      {inCardView
        ? t['com.affine.payment.billing-setting.payment-method']()
        : t['com.affine.payment.billing-setting.payment-method.go']()}
    </Button>
  );
};
