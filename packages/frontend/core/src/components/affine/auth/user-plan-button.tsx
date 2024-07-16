import { Tooltip } from '@affine/component/ui/tooltip';
import { mixpanel } from '@affine/core/utils';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useServices } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import { openSettingModalAtom } from '../../../atoms';
import {
  ServerConfigService,
  SubscriptionService,
} from '../../../modules/cloud';
import * as styles from './style.css';

export const UserPlanButton = () => {
  const { serverConfigService, subscriptionService } = useServices({
    ServerConfigService,
    SubscriptionService,
  });

  const hasPayment = useLiveData(
    serverConfigService.serverConfig.features$.map(r => r?.payment)
  );
  const plan = useLiveData(
    subscriptionService.subscription.pro$.map(subscription =>
      subscription !== null ? subscription?.plan : null
    )
  );
  const isBeliever = useLiveData(subscriptionService.subscription.isBeliever$);
  const isLoading = plan === null;

  useEffect(() => {
    // revalidate subscription to get the latest status
    subscriptionService.subscription.revalidate();
  }, [subscriptionService]);

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setSettingModalAtom({
        open: true,
        activeTab: 'plans',
        scrollAnchor: 'cloudPricingPlan',
      });
      mixpanel.track('PlansViewed', {
        segment: 'settings panel',
        module: 'profile and badge',
      });
    },
    [setSettingModalAtom]
  );

  const t = useI18n();

  if (!hasPayment) {
    // no payment feature
    return;
  }

  if (isLoading) {
    // loading, do nothing
    return;
  }

  const planLabel = isBeliever ? 'Believer' : (plan ?? SubscriptionPlan.Free);

  return (
    <Tooltip content={t['com.affine.payment.tag-tooltips']()} side="top">
      <div
        data-is-believer={isBeliever ? 'true' : undefined}
        className={styles.userPlanButton}
        onClick={handleClick}
      >
        {planLabel}
      </div>
    </Tooltip>
  );
};
