import { Button, ErrorMessage, Skeleton } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { openSettingModalAtom } from '@affine/core/components/atoms';
import {
  ServerConfigService,
  SubscriptionService,
  UserCopilotQuotaService,
} from '@affine/core/modules/cloud';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { AIResume, AISubscribe } from '../general-setting/plans/ai/actions';
import * as styles from './storage-progress.css';

export const AIUsagePanel = () => {
  const t = useI18n();
  const setOpenSettingModal = useSetAtom(openSettingModalAtom);
  const serverConfigService = useService(ServerConfigService);
  const hasPaymentFeature = useLiveData(
    serverConfigService.serverConfig.features$.map(f => f?.payment)
  );
  const subscriptionService = useService(SubscriptionService);
  const aiSubscription = useLiveData(subscriptionService.subscription.ai$);
  useEffect(() => {
    // revalidate latest subscription status
    subscriptionService.subscription.revalidate();
  }, [subscriptionService]);
  const copilotQuotaService = useService(UserCopilotQuotaService);
  useEffect(() => {
    copilotQuotaService.copilotQuota.revalidate();
  }, [copilotQuotaService]);
  const copilotActionLimit = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionLimit$
  );
  const copilotActionUsed = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionUsed$
  );
  const loading = copilotActionLimit === null || copilotActionUsed === null;
  const loadError = useLiveData(copilotQuotaService.copilotQuota.error$);

  const openBilling = useCallback(() => {
    setOpenSettingModal({
      open: true,
      activeTab: 'billing',
    });
    track.$.settingsPanel.accountUsage.viewPlans({ plan: SubscriptionPlan.AI });
  }, [setOpenSettingModal]);

  if (loading) {
    if (loadError) {
      return (
        <SettingRow
          name={t['com.affine.payment.ai.usage-title']()}
          desc={''}
          spreadCol={false}
        >
          {/* TODO(@catsjuice): i18n */}
          <ErrorMessage>Load error</ErrorMessage>
        </SettingRow>
      );
    }
    return (
      <SettingRow
        name={t['com.affine.payment.ai.usage-title']()}
        desc={''}
        spreadCol={false}
      >
        <Skeleton height={42} />
      </SettingRow>
    );
  }

  const percent =
    copilotActionLimit === 'unlimited'
      ? 0
      : Math.min(
          100,
          Math.max(
            0.5,
            Number(((copilotActionUsed / copilotActionLimit) * 100).toFixed(4))
          )
        );

  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  return (
    <SettingRow
      spreadCol={aiSubscription ? true : false}
      desc={
        aiSubscription
          ? t['com.affine.payment.ai.usage-description-purchased']()
          : ''
      }
      name={t['com.affine.payment.ai.usage-title']()}
    >
      {copilotActionLimit === 'unlimited' ? (
        hasPaymentFeature && aiSubscription?.canceledAt ? (
          <AIResume />
        ) : (
          <Button onClick={openBilling}>
            {t['com.affine.payment.ai.usage.change-button-label']()}
          </Button>
        )
      ) : (
        <div className={styles.storageProgressContainer}>
          <div className={styles.storageProgressWrapper}>
            <div className="storage-progress-desc">
              <span>{t['com.affine.payment.ai.usage.used-caption']()}</span>
              <span>
                {t['com.affine.payment.ai.usage.used-detail']({
                  used: copilotActionUsed.toString(),
                  limit: copilotActionLimit.toString(),
                })}
              </span>
            </div>

            <div className="storage-progress-bar-wrapper">
              <div
                className={styles.storageProgressBar}
                style={{ width: `${percent}%`, backgroundColor: color }}
              ></div>
            </div>
          </div>

          {hasPaymentFeature && (
            <AISubscribe variant="primary">
              {t['com.affine.payment.ai.usage.purchase-button-label']()}
            </AISubscribe>
          )}
        </div>
      )}
    </SettingRow>
  );
};
