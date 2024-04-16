import { Button } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { openSettingModalAtom } from '@affine/core/atoms';
import { useQuery } from '@affine/core/hooks/use-query';
import { useUserSubscription } from '@affine/core/hooks/use-subscription';
import {
  getCopilotQuotaQuery,
  pricesQuery,
  SubscriptionPlan,
  SubscriptionRecurring,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { cssVar } from '@toeverything/theme';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { useAffineAISubscription } from '../general-setting/plans/ai/use-affine-ai-subscription';
import * as styles from './storage-progress.css';

export const AIUsagePanel = () => {
  const t = useAFFiNEI18N();
  const setOpenSettingModal = useSetAtom(openSettingModalAtom);
  const [, mutateSubscription] = useUserSubscription();
  const { actionType, Action } = useAffineAISubscription();

  const openAiPricingPlan = useCallback(() => {
    setOpenSettingModal({
      open: true,
      activeTab: 'plans',
      scrollAnchor: 'aiPricingPlan',
    });
  }, [setOpenSettingModal]);

  if (actionType === 'cancel') {
    return (
      <SettingRow
        desc={t['com.affine.payment.ai.usage-description-purchased']()}
        name={t['com.affine.payment.ai.usage-title']()}
      >
        <Button onClick={openAiPricingPlan}>
          {t['com.affine.payment.ai.usage.change-button-label']()}
        </Button>
      </SettingRow>
    );
  }

  if (actionType === 'resume') {
    return (
      <SettingRow
        desc={t['com.affine.payment.ai.usage-description-purchased']()}
        name={t['com.affine.payment.ai.usage-title']()}
      >
        <Action onSubscriptionUpdate={mutateSubscription} />
      </SettingRow>
    );
  }

  return <AIUsagePanelNotSubscripted />;
};

export const AIUsagePanelNotSubscripted = () => {
  const t = useAFFiNEI18N();
  const [, mutateSubscription] = useUserSubscription();
  const { actionType, Action } = useAffineAISubscription();

  const {
    data: { prices },
  } = useQuery({ query: pricesQuery });
  const { data: quota } = useQuery({
    query: getCopilotQuotaQuery,
  });
  const { limit: nullableLimit, used = 0 } =
    quota.currentUser?.copilot.quota || {};
  const limit = nullableLimit || 10;
  const percent = Math.min(
    100,
    Math.max(0.5, Number(((used / limit) * 100).toFixed(4)))
  );

  const price = prices.find(p => p.plan === SubscriptionPlan.AI);
  assertExists(price);

  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  return (
    <SettingRow
      spreadCol={false}
      desc=""
      name={t['com.affine.payment.ai.usage-title']()}
    >
      <div className={styles.storageProgressContainer}>
        <div className={styles.storageProgressWrapper}>
          <div className="storage-progress-desc">
            <span>{t['com.affine.payment.ai.usage.used-caption']()}</span>
            <span>
              {t['com.affine.payment.ai.usage.used-detail']({
                used: used.toString(),
                limit: limit.toString(),
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

        <Action
          recurring={SubscriptionRecurring.Yearly}
          onSubscriptionUpdate={mutateSubscription}
          price={price}
          type="primary"
          className={styles.storageButton}
        >
          {actionType === 'subscribe'
            ? t['com.affine.payment.ai.usage.purchase-button-label']()
            : null}
        </Action>
      </div>
    </SettingRow>
  );
};
