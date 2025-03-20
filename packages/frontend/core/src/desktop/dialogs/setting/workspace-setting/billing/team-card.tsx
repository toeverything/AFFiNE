import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import {
  SubscriptionService,
  WorkspaceSubscriptionService,
} from '@affine/core/modules/cloud';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { SubscriptionRecurring } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { CancelTeamAction } from '../../general-setting/plans/actions';
import { CardNameLabelRow } from './card-name-label-row';
import * as styles from './styles.css';

export const TeamCard = () => {
  const t = useI18n();
  const workspaceSubscriptionService = useService(WorkspaceSubscriptionService);
  const workspaceQuotaService = useService(WorkspaceQuotaService);
  const subscriptionService = useService(SubscriptionService);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const workspaceMemberCount = workspaceQuota?.memberCount;
  const teamSubscription = useLiveData(
    workspaceSubscriptionService.subscription.subscription$
  );
  const teamPrices = useLiveData(subscriptionService.prices.teamPrice$);

  const [openCancelModal, setOpenCancelModal] = useState(false);

  useEffect(() => {
    workspaceSubscriptionService.subscription.revalidate();
    workspaceQuotaService.quota.revalidate();
    subscriptionService.prices.revalidate();
  }, [
    subscriptionService,
    workspaceQuotaService,
    workspaceSubscriptionService,
  ]);

  const expiration = teamSubscription?.canceledAt;
  const nextBillingDate = teamSubscription?.nextBillAt;
  const recurring = teamSubscription?.recurring;
  const endDate = teamSubscription?.end;

  const description = useMemo(() => {
    if (recurring === SubscriptionRecurring.Yearly) {
      return t[
        'com.affine.settings.workspace.billing.team-workspace.description.billed.annually'
      ]();
    }
    if (recurring === SubscriptionRecurring.Monthly) {
      return t[
        'com.affine.settings.workspace.billing.team-workspace.description.billed.monthly'
      ]();
    }
    return t['com.affine.payment.billing-setting.free-trial']();
  }, [recurring, t]);

  const expirationDate = useMemo(() => {
    if (expiration && endDate) {
      return t[
        'com.affine.settings.workspace.billing.team-workspace.not-renewed'
      ]({
        date: new Date(endDate).toLocaleDateString(),
      });
    }
    if (nextBillingDate && endDate) {
      return t[
        'com.affine.settings.workspace.billing.team-workspace.next-billing-date'
      ]({
        date: new Date(endDate).toLocaleDateString(),
      });
    }
    return '';
  }, [endDate, expiration, nextBillingDate, t]);

  const amount = teamSubscription
    ? teamPrices && workspaceMemberCount
      ? teamSubscription.recurring === SubscriptionRecurring.Monthly
        ? String(
            (teamPrices.amount ? teamPrices.amount * workspaceMemberCount : 0) /
              100
          )
        : String(
            (teamPrices.yearlyAmount
              ? teamPrices.yearlyAmount * workspaceMemberCount
              : 0) / 100
          )
      : '?'
    : '0';
  const handleClick = useCallback(() => {
    setOpenCancelModal(true);
  }, []);

  return (
    <div className={styles.planCard}>
      <div className={styles.currentPlan}>
        <SettingRow
          spreadCol={false}
          name={
            <CardNameLabelRow
              cardName={t[
                'com.affine.settings.workspace.billing.team-workspace'
              ]()}
              status={teamSubscription?.status}
            />
          }
          desc={
            <>
              <div>{description}</div>
              <div>{expirationDate}</div>
            </>
          }
        />
        <CancelTeamAction
          open={openCancelModal}
          onOpenChange={setOpenCancelModal}
        >
          <Button
            variant="secondary"
            className={styles.cancelPlanButton}
            onClick={handleClick}
          >
            {t[
              'com.affine.settings.workspace.billing.team-workspace.cancel-plan'
            ]()}
          </Button>
        </CancelTeamAction>
      </div>
      <p className={styles.planPrice}>
        ${amount}
        <span className={styles.billingFrequency}>
          /
          {teamSubscription?.recurring === SubscriptionRecurring.Monthly
            ? t['com.affine.payment.billing-setting.month']()
            : t['com.affine.payment.billing-setting.year']()}
        </span>
      </p>
    </div>
  );
};
