import { Tooltip } from '@affine/component/ui/tooltip';
import { mixpanel } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
      });
      mixpanel.track('PlansViewed', {
        segment: 'settings panel',
        module: 'profile and badge',
      });
    },
    [setSettingModalAtom]
  );

  const t = useAFFiNEI18N();

  if (!hasPayment) {
    // no payment feature
    return;
  }

  if (isLoading) {
    // loading, do nothing
    return;
  }

  if (!plan) {
    // no plan, do nothing
    return;
  }

  return (
    <Tooltip content={t['com.affine.payment.tag-tooltips']()} side="top">
      <div className={styles.userPlanButton} onClick={handleClick}>
        {plan}
      </div>
    </Tooltip>
  );
};
