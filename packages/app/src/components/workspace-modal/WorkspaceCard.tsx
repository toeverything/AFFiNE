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
import { FlexWrapper } from '@/ui/layout';

export const WorkspaceCard = ({
  workspaceData,
  onClick,
}: {
  workspaceData: WorkspaceUnit;
  onClick: (data: WorkspaceUnit) => void;
}) => {
  const { currentWorkspace, isOwner } = useAppState();

  return (
    <StyledCard
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
        {isOwner ? (
          workspaceData.provider === 'local' ? (
            <p>
              <LocalIcon />
              Local Workspace
            </p>
          ) : (
            <p>
              <CloudIcon />
              Cloud Workspace
            </p>
          )
        ) : (
          <p>
            <UsersIcon fontSize={20} color={'#FF646B'} />
            Joined Workspace
          </p>
        )}
        {workspaceData.provider === 'local' && (
          <p>
            <OfflineIcon />
            All data can be accessed offline
          </p>
        )}
        {workspaceData.published && (
          <p>
            <PublishIcon fontSize={16} /> Published to Web
          </p>
        )}
      </StyleWorkspaceInfo>
    </StyledCard>
  );
};
