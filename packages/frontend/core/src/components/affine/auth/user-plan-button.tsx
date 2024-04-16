import { Tooltip } from '@affine/component/ui/tooltip';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { withErrorBoundary } from 'react-error-boundary';

import { openSettingModalAtom } from '../../../atoms';
import {
  ServerConfigService,
  SubscriptionService,
} from '../../../modules/cloud';
import * as styles from './style.css';

const UserPlanButtonWithData = () => {
  const serverConfig = useService(ServerConfigService).serverConfig;
  const subscription = useService(SubscriptionService).subscription;

  useEffect(() => {
    // revalidate subscription to get the latest status
    subscription.revalidate();
  }, [serverConfig, subscription]);

  const hasPayment = useLiveData(serverConfig.features$.map(r => r?.payment));
  const plan = useLiveData(subscription.primary$)?.plan;

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setSettingModalAtom({
        open: true,
        activeTab: 'plans',
      });
    },
    [setSettingModalAtom]
  );

  const t = useAFFiNEI18N();

  if (!hasPayment) {
    // no payment feature
    return;
  }

  if (!plan) {
    // TODO: loading
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

// If fetch user data failed, just render empty.
export const UserPlanButton = withErrorBoundary(UserPlanButtonWithData, {
  fallbackRender: () => null,
});
