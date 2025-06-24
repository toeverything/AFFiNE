import { ErrorMessage, Skeleton } from '@affine/component';
import { UserQuotaService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useEffect } from 'react';

import { UserPlanButton } from '../../affine/auth/user-plan-button';
import { useCatchEventCallback } from '../../hooks/use-catch-event-hook';
import * as styles from './index.css';

export const CloudUsage = () => {
  const t = useI18n();
  const quota = useService(UserQuotaService).quota;
  const quotaError = useLiveData(quota.error$);

  const workspaceDialogService = useService(WorkspaceDialogService);
  const handleClick = useCatchEventCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [workspaceDialogService]);

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);
  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  if (percent === null) {
    if (quotaError) {
      return <ErrorMessage>Failed to load quota</ErrorMessage>;
    }
    return (
      <div>
        <Skeleton height={15} width={50} />
        <Skeleton height={10} style={{ marginTop: 4 }} />
      </div>
    );
  }

  return (
    <div
      className={clsx(styles.usageBlock, styles.cloudUsageBlock)}
      style={assignInlineVars({
        [styles.progressColorVar]: color,
      })}
    >
      <div className={styles.usageLabel}>
        <div>
          <span className={styles.usageLabelTitle}>
            {t['com.affine.user-info.usage.cloud']()}
          </span>
          <span>{usedFormatted}</span>
          <span>&nbsp;/&nbsp;</span>
          <span>{maxFormatted}</span>
        </div>
        <UserPlanButton onClick={handleClick} />
      </div>

      <div className={styles.cloudUsageBar}>
        <div
          className={styles.cloudUsageBarInner}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
