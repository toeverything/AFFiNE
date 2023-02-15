import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import {
  JoinedWorkspaceIcon,
  LocalWorkspaceIcon,
  CloudWorkspaceIcon,
  LocalDataIcon,
  PublishIcon,
} from '@/components/icons';
import { WorkspaceUnit } from '@affine/datacenter';
import { useAppState } from '@/providers/app-state-provider';
import { StyleWorkspaceInfo, StyleWorkspaceTitle, StyledCard } from './styles';
import { useTranslation } from '@affine/i18n';
import { useGlobalState } from '@/store/app';

const WorkspaceType = ({ workspaceData }: { workspaceData: WorkspaceUnit }) => {
  const user = useGlobalState(store => store.user);
  const { t } = useTranslation();
  const isOwner = user?.id === workspaceData.owner?.id;

  if (workspaceData.provider === 'local') {
    return (
      <p>
        <LocalWorkspaceIcon />
        {t('Local Workspace')}
      </p>
    );
  }

  return isOwner ? (
    <p>
      <CloudWorkspaceIcon />
      {t('Cloud Workspace')}
    </p>
  ) : (
    <p>
      <JoinedWorkspaceIcon />
      {t('Joined Workspace')}
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
  const { currentWorkspace } = useAppState();
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
          <p>
            <LocalDataIcon />
            {t('Available Offline')}
          </p>
        )}
        {workspaceData.published && (
          <p>
            <PublishIcon />
            {t('Published to Web')}
          </p>
        )}
      </StyleWorkspaceInfo>
    </StyledCard>
  );
};
