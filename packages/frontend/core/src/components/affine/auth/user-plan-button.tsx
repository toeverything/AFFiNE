import { SubscriptionPlan } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import Tooltip from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { withErrorBoundary } from 'react-error-boundary';

import { openSettingModalAtom } from '../../../atoms';
import { useUserSubscription } from '../../../hooks/use-subscription';
import * as styles from './style.css';

const UserPlanButtonWithData = () => {
  const [subscription] = useUserSubscription();
  const plan = subscription?.plan ?? SubscriptionPlan.Free;

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      setSettingModalAtom({
        open: true,
        activeTab: 'plans',
        workspaceId: null,
      });
    },
    [setSettingModalAtom]
  );

  const t = useAFFiNEI18N();

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
