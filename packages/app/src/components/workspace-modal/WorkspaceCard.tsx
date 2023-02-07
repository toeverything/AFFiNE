import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import {
  CloudIcon,
  LocalIcon,
  OfflineIcon,
  PublishedIcon,
} from '@/components/workspace-modal/icons';
import { UsersIcon } from '@blocksuite/icons';
import { WorkspaceUnit } from '@affine/datacenter';
import { useAppState } from '@/providers/app-state-provider';
import { StyleWorkspaceInfo, StyleWorkspaceTitle, StyledCard } from './styles';
import { useTranslation } from '@affine/i18n';
import { FlexWrapper } from '@/ui/layout';

const WorkspaceType = ({ workspaceData }: { workspaceData: WorkspaceUnit }) => {
  const { user } = useAppState();
  const { t } = useTranslation();
  const isOwner = user?.id === workspaceData.owner?.id;

  if (workspaceData.provider === 'local') {
    return (
      <p>
        <LocalIcon />
        {t('Local Workspace')}
      </p>
    );
  }

  return isOwner ? (
    <p>
      <CloudIcon />
      {t('Cloud Workspace')}
    </p>
  ) : (
    <p>
      <UsersIcon fontSize={20} color={'#FF646B'} />
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
  const { currentWorkspace, user } = useAppState();
  const { t } = useTranslation();
  const isOwner = user?.id === workspaceData.owner?.id;
  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={() => {
        onClick(workspaceData);
      }}
      active={workspaceData.id === currentWorkspace?.id}
    >
      <FlexWrapper>
        <WorkspaceUnitAvatar size={58} workspaceUnit={workspaceData} />
      </FlexWrapper>

      <StyleWorkspaceInfo>
        <StyleWorkspaceTitle>
          {workspaceData.name || 'AFFiNE'}
        </StyleWorkspaceTitle>
        <WorkspaceType workspaceData={workspaceData} />
        {workspaceData.provider === 'local' && (
          <p>
            <OfflineIcon />
            {t('Available Offline')}
          </p>
        )}
        {workspaceData.published && (
          <p>
            <PublishedIcon />
            {t('Published to Web')}
          </p>
        )}
      </StyleWorkspaceInfo>
    </StyledCard>
  );
};
