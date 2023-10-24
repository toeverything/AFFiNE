import { SubscriptionPlan } from '@affine/graphql';
import Tooltip from '@toeverything/components/tooltip';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { openSettingModalAtom } from '../../../atoms';
import { useUserSubscription } from '../../../hooks/use-subscription';
import * as styles from './style.css';

export const UserPlanButton = () => {
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

  return (
    <Tooltip content={'See all plans'} side="top">
      <div className={styles.userPlanButton} onClick={handleClick}>
        {plan}
      </div>
    </Tooltip>
  );
};
