import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import {
  JoinedWorkspaceIcon,
  LocalWorkspaceIcon,
  CloudWorkspaceIcon,
  LocalDataIcon,
  PublishIcon,
} from '@/components/icons';
import { WorkspaceUnit } from '@affine/datacenter';
import { StyleWorkspaceInfo, StyleWorkspaceTitle, StyledCard } from './styles';
import { useTranslation } from '@affine/i18n';
import { useGlobalState } from '@/store/app';
import { useCallback } from 'react';

const WorkspaceType = ({ workspaceData }: { workspaceData: WorkspaceUnit }) => {
  const user = useGlobalState(store => store.user);
  const { t } = useTranslation();
  const isOwner = user?.id === workspaceData.owner?.id;

  if (workspaceData.provider === 'local') {
    return (
      <p title={t('Local Workspace')}>
        <LocalWorkspaceIcon />
        <span>{t('Local Workspace')}</span>
      </p>
    );
  }

  return isOwner ? (
    <p title={t('Cloud Workspace')}>
      <CloudWorkspaceIcon />
      <span>{t('Cloud Workspace')}</span>
    </p>
  ) : (
    <p title={t('Joined Workspace')}>
      <JoinedWorkspaceIcon />
      <span>{t('Joined Workspace')}</span>
    </p>
  );
};

export const WorkspaceCard = ({
  workspaceData,
  onClick,
}: {
  workspaceData: WorkspaceUnit;
  onClick: (data: WorkspaceUnit) => void;
}) => {
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const { t } = useTranslation();
  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={() => {
        onClick(workspaceData);
      }}
      active={workspaceData.id === currentWorkspace?.id}
    >
      <WorkspaceUnitAvatar size={58} workspaceUnit={workspaceData} />

      <StyleWorkspaceInfo>
        <StyleWorkspaceTitle>
          {workspaceData.name || 'AFFiNE'}
        </StyleWorkspaceTitle>
        <WorkspaceType workspaceData={workspaceData} />
        {workspaceData.provider === 'local' && (
          <p title={t('Available Offline')}>
            <LocalDataIcon />
            <span>{t('Available Offline')}</span>
          </p>
        )}
        {workspaceData.published && (
          <p title={t('Published to Web')}>
            <PublishIcon />
            <span>{t('Published to Web')}</span>
          </p>
        )}
      </StyleWorkspaceInfo>
    </StyledCard>
  );
};
