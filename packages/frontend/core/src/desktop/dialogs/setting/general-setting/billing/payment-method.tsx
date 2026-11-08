import { SettingRow } from '@affine/component/setting-components';
import { Button, IconButton } from '@affine/component/ui/button';
import { SubscriptionService } from '@affine/core/modules/cloud';
import type { SubscriptionType } from '@affine/core/modules/cloud/entities/subscription';
import { SubscriptionRecurring } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { CancelAction, ResumeAction } from '../plans/actions';
import {
  ManageSubscriptionButton,
  SubscriptionSourceRow,
} from './manage-subscription';
import * as styles from './style.css';

export const PaymentMethod = ({
  subscription,
}: {
  subscription: SubscriptionType;
}) =>
  subscription.provider === 'stripe' ? (
    <StripePaymentMethod subscription={subscription} />
  ) : (
    <SubscriptionSourceRow source={subscription} />
  );

const StripePaymentMethod = ({
  subscription,
}: {
  subscription: SubscriptionType;
}) => {
  const t = useI18n();
  const isBeliever = subscription.recurring === SubscriptionRecurring.Lifetime;

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
        <ManageSubscriptionButton source={subscription} />
      </SettingRow>
      {isBeliever ? null : subscription.end && subscription.canceledAt ? (
        <SettingRow
          name={t['com.affine.payment.billing-setting.expiration-date']()}
          desc={t[
            'com.affine.payment.billing-setting.expiration-date.description'
          ]({
            expirationDate: new Date(subscription.end).toLocaleDateString(),
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
