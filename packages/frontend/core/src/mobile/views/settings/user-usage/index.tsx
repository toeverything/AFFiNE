import {
  AuthService,
  ServerConfigService,
  UserCopilotQuotaService,
  UserQuotaService,
} from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useEffect } from 'react';

import { SettingGroup } from '../group';
import * as styles from './style.css';

export const UserUsage = () => {
  const session = useService(AuthService).session;
  const loginStatus = useLiveData(session.status$);

  if (loginStatus !== 'authenticated') {
    return null;
  }

  return <UsagePanel />;
};

const Progress = ({
  name,
  percent,
  desc,
  color,
}: {
  name: string;
  percent: number;
  desc: string;
  color: string | null;
}) => {
  return (
    <div className={styles.progressRoot}>
      <div className={styles.progressInfoRow}>
        <span className={styles.progressName}>{name}</span>
        <span className={styles.progressDesc}>{desc}</span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={styles.progressBar}
          style={{
            width: `${percent}%`,
            backgroundColor: color ?? cssVarV2('button/primary'),
          }}
        />
      </div>
    </div>
  );
};

const UsagePanel = () => {
  const serverConfigService = useService(ServerConfigService);
  const serverFeatures = useLiveData(
    serverConfigService.serverConfig.features$
  );

  return (
    <SettingGroup title="Storage">
      <CloudUsage />
      {serverFeatures?.copilot ? <AiUsage /> : null}
    </SettingGroup>
  );
};

const CloudUsage = () => {
  const quota = useService(UserQuotaService).quota;

  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);

  const loading = percent === null;

  if (loading) return null;

  return (
    <Progress
      name="Cloud"
      percent={percent}
      desc={`${usedFormatted}/${maxFormatted}`}
      color={color}
    />
  );
};
const AiUsage = () => {
  const copilotQuotaService = useService(UserCopilotQuotaService);

  const copilotActionLimit = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionLimit$
  );
  const copilotActionUsed = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionUsed$
  );
  const loading = copilotActionLimit === null || copilotActionUsed === null;
  const loadError = useLiveData(copilotQuotaService.copilotQuota.error$);

  useEffect(() => {
    copilotQuotaService.copilotQuota.revalidate();
  }, [copilotQuotaService]);

  if (loading || loadError) {
    return null;
  }

  if (copilotActionLimit === 'unlimited') {
    return null;
  }

  const percent = Math.min(
    100,
    Math.max(
      0.5,
      Number(((copilotActionUsed / copilotActionLimit) * 100).toFixed(4))
    )
  );

  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  return (
    <Progress
      name="AI"
      percent={percent}
      desc={`${copilotActionUsed}/${copilotActionLimit}`}
      color={color}
    />
  );
};
