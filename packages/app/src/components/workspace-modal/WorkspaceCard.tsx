import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import {
  CloudIcon,
  LocalIcon,
  OfflineIcon,
} from '@/components/workspace-modal/icons';
import { PublishIcon, UsersIcon } from '@blocksuite/icons';
import { WorkspaceUnit } from '@affine/datacenter';
import { useAppState } from '@/providers/app-state-provider';
import { StyleWorkspaceInfo, StyleWorkspaceTitle, StyledCard } from './styles';
import { Wrapper } from '@/ui/layout';
import { useTranslation } from '@affine/i18n';

export const WorkspaceCard = ({
  workspaceData,
  onClick,
}: {
  workspaceData: WorkspaceUnit;
  onClick: (data: WorkspaceUnit) => void;
}) => {
  const { currentWorkspace, isOwner } = useAppState();
  const { t } = useTranslation();
  return (
    <StyledCard
      onClick={() => {
        onClick(workspaceData);
      }}
      active={workspaceData.id === currentWorkspace?.id}
    >
      <Wrapper>
        <WorkspaceUnitAvatar size={58} workspaceUnit={workspaceData} />
      </Wrapper>

      <StyleWorkspaceInfo>
        <StyleWorkspaceTitle>
          {workspaceData.name || 'AFFiNE'}
        </StyleWorkspaceTitle>
        {isOwner ? (
          workspaceData.provider === 'local' ? (
            <p>
              <LocalIcon />
              {t('Local Workspace')}
            </p>
          ) : (
            <p>
              <CloudIcon />
              {t('Cloud Workspace')}
            </p>
          )
        ) : (
          <p>
            <UsersIcon fontSize={20} color={'#FF646B'} />
            {t('Joined Workspace')}
          </p>
        )}
        {workspaceData.provider === 'local' && (
          <p>
            <OfflineIcon />
            {t('Available Offline')}
          </p>
        )}
        {workspaceData.published && (
          <p>
            <PublishIcon fontSize={16} />
            {t('Published to Web')}
          </p>
        )}
      </StyleWorkspaceInfo>
    </StyledCard>
  );
};
