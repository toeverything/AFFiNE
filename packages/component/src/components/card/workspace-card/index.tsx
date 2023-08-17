import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { SettingsIcon } from '@blocksuite/icons';
import {
  CloudWorkspaceIcon as DefaultCloudWorkspaceIcon,
  CollaborationIcon as DefaultJoinedWorkspaceIcon,
  LocalWorkspaceIcon as DefaultLocalWorkspaceIcon,
} from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useStaticBlockSuiteWorkspace } from '@toeverything/infra/__internal__/react';
import { useCallback } from 'react';

import { WorkspaceAvatar } from '../../workspace-avatar';
import {
  StyledCard,
  StyledSettingLink,
  StyledWorkspaceInfo,
  StyledWorkspaceTitle,
} from './styles';

const JoinedWorkspaceIcon = () => {
  return <DefaultJoinedWorkspaceIcon style={{ color: '#FF646B' }} />;
};
const LocalWorkspaceIcon = () => {
  return <DefaultLocalWorkspaceIcon style={{ color: '#FDBD32' }} />;
};

const CloudWorkspaceIcon = () => {
  return <DefaultCloudWorkspaceIcon style={{ color: '#60A5FA' }} />;
};

// const LocalDataIcon = () => {
//   return <DefaultLocalDataIcon style={{ color: '#62CD80' }} />;
// };

export interface WorkspaceTypeProps {
  flavour: WorkspaceFlavour;
}

const WorkspaceType = ({ flavour }: WorkspaceTypeProps) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const isOwner = true;

  if (flavour === WorkspaceFlavour.LOCAL) {
    return (
      <p style={{ fontSize: '10px' }} title={t['Local Workspace']()}>
        <LocalWorkspaceIcon />
        <span>{t['Local Workspace']()}</span>
      </p>
    );
  }

  return isOwner ? (
    <p style={{ fontSize: '10px' }} title={t['Cloud Workspace']()}>
      <CloudWorkspaceIcon />
      <span>{t['Cloud Workspace']()}</span>
    </p>
  ) : (
    <p style={{ fontSize: '10px' }} title={t['Joined Workspace']()}>
      <JoinedWorkspaceIcon />
      <span>{t['Joined Workspace']()}</span>
    </p>
  );
};

export interface WorkspaceCardProps {
  currentWorkspaceId: string | null;
  meta: RootWorkspaceMetadata;
  onClick: (workspaceId: string) => void;
  onSettingClick: (workspaceId: string) => void;
}

export const WorkspaceCard = ({
  onClick,
  onSettingClick,
  currentWorkspaceId,
  meta,
}: WorkspaceCardProps) => {
  // const t = useAFFiNEI18N();
  const workspace = useStaticBlockSuiteWorkspace(meta.id);
  const [name] = useBlockSuiteWorkspaceName(workspace);

  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(meta.id);
      }, [onClick, meta.id])}
      active={workspace.id === currentWorkspaceId}
    >
      <WorkspaceAvatar size={28} workspace={workspace} />

      <StyledWorkspaceInfo>
        <StyledWorkspaceTitle>{name}</StyledWorkspaceTitle>
        <WorkspaceType flavour={meta.flavour} />
        {/* {meta.flavour === WorkspaceFlavour.LOCAL && (
          <p title={t['Available Offline']()}>
            <LocalDataIcon />
            <span>{t['Available Offline']()}</span>
          </p>
        )} */}
      </StyledWorkspaceInfo>
      <StyledSettingLink
        className="setting-entry"
        data-testid="workspace-card-setting-button"
        onClick={e => {
          e.stopPropagation();
          onSettingClick(meta.id);
        }}
      >
        <SettingsIcon />
      </StyledSettingLink>
    </StyledCard>
  );
};
