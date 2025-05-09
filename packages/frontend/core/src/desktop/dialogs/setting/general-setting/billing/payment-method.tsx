import { notify } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import {
  Button,
  type ButtonProps,
  IconButton,
} from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { SubscriptionService } from '@affine/core/modules/cloud';
import { UrlService } from '@affine/core/modules/url';
import { UserFriendlyError } from '@affine/error';
import { createCustomerPortalMutation } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { useMutation } from '../../../../../components/hooks/use-mutation';
import { CancelAction, ResumeAction } from '../plans/actions';
import * as styles from './style.css';

export const PaymentMethod = () => {
  const t = useI18n();
  const subscriptionService = useService(SubscriptionService);
  useEffect(() => {
    subscriptionService.subscription.revalidate();
    subscriptionService.prices.revalidate();
  }, [subscriptionService]);

  const proSubscription = useLiveData(subscriptionService.subscription.pro$);
  const isBeliever = useLiveData(subscriptionService.subscription.isBeliever$);
  const isOnetime = useLiveData(subscriptionService.subscription.isOnetimeAI$);

  const [openCancelModal, setOpenCancelModal] = useState(false);
  return (
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
      {isBeliever || isOnetime ? null : proSubscription?.end &&
        proSubscription?.canceledAt ? (
        <SettingRow
          name={t['com.affine.payment.billing-setting.expiration-date']()}
          desc={t[
            'com.affine.payment.billing-setting.expiration-date.description'
          ]({
            expirationDate: new Date(proSubscription.end).toLocaleDateString(),
          })}
        >
          <ResumeSubscription />
        </SettingRow>
      ) : (
        <CancelAction open={openCancelModal} onOpenChange={setOpenCancelModal}>
          <SettingRow
            style={{ cursor: 'pointer' }}
            onClick={() => {
              setOpenCancelModal(true);
            }}
            className="dangerous-setting"
            name={t['com.affine.payment.billing-setting.cancel-subscription']()}
            desc={t[
              'com.affine.payment.billing-setting.cancel-subscription.description'
            ]()}
          >
            <CancelSubscription />
          </SettingRow>
        </CancelAction>
      )}
    </>
  );
};

export const PaymentMethodUpdater = ({
  inCardView,
  className,
  variant,
}: {
  inCardView?: boolean;
  className?: string;
  variant?: ButtonProps['variant'];
}) => {
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
      const userFriendlyError = UserFriendlyError.fromAny(e);
      notify.error(userFriendlyError);
    });
  }, [trigger, urlService]);

  return (
    <Button
      onClick={update}
      loading={isMutating}
      disabled={isMutating}
      className={className}
      variant={variant}
    >
      {inCardView
        ? t['com.affine.payment.billing-setting.payment-method']()
        : t['com.affine.payment.billing-setting.payment-method.go']()}
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
