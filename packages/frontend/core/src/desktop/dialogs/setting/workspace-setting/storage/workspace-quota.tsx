import { ErrorMessage, Skeleton } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useEffect } from 'react';

import * as styles from './style.css';

export const WorkspaceQuotaPanel = () => {
  const t = useI18n();

  return (
    <SettingRow
      name={t['com.affine.workspace.storage']()}
      desc=""
      spreadCol={false}
    >
      <StorageProgress />
    </SettingRow>
  );
};

export const StorageProgress = () => {
  const t = useI18n();

  const workspaceQuotaService = useService(WorkspaceQuotaService).quota;

  const isLoading = useLiveData(workspaceQuotaService.isRevalidating$);
  const usedFormatted = useLiveData(workspaceQuotaService.usedFormatted$);
  const maxFormatted = useLiveData(workspaceQuotaService.maxFormatted$);
  const percent = useLiveData(workspaceQuotaService.percent$);
  const color = useLiveData(workspaceQuotaService.color$);

  useEffect(() => {
    // revalidate quota to get the latest status
    workspaceQuotaService.revalidate();
  }, [workspaceQuotaService]);

  const loadError = useLiveData(workspaceQuotaService.error$);

  if (isLoading) {
    if (loadError) {
      return <ErrorMessage>Load error</ErrorMessage>;
    }
    return <Skeleton height={26} />;
  }

  return (
    <div className={styles.storageProgressContainer}>
      <div className={styles.storageProgressWrapper}>
        <div className="storage-progress-desc">
          <span>{t['com.affine.storage.used.hint']()}</span>
          <span>
            {usedFormatted}/{maxFormatted}
          </span>
        </div>
        <div className="storage-progress-bar-wrapper">
          <div
            className={styles.storageProgressBar}
            style={{
              width: `${percent}%`,
              backgroundColor: color ?? cssVarV2('toast/iconState/regular'),
            }}
          ></div>
        </div>
      </div>
    </div>
  );
};
