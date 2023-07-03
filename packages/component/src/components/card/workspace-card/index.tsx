import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SettingsIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type { FC } from 'react';
import { useCallback } from 'react';

import { WorkspaceAvatar } from '../../workspace-avatar';
import {
  StyledCard,
  StyledSettingLink,
  StyleWorkspaceInfo,
  StyleWorkspaceTitle,
} from './styles';

export type WorkspaceTypeProps = {
  workspace: AffineCloudWorkspace | LocalWorkspace;
};

import {
  CloudWorkspaceIcon as DefaultCloudWorkspaceIcon,
  CollaborationIcon as DefaultJoinedWorkspaceIcon,
  LocalDataIcon as DefaultLocalDataIcon,
  LocalWorkspaceIcon as DefaultLocalWorkspaceIcon,
} from '@blocksuite/icons';

const JoinedWorkspaceIcon = () => {
  return <DefaultJoinedWorkspaceIcon style={{ color: '#FF646B' }} />;
};
const LocalWorkspaceIcon = () => {
  return <DefaultLocalWorkspaceIcon style={{ color: '#FDBD32' }} />;
};

const CloudWorkspaceIcon = () => {
  return <DefaultCloudWorkspaceIcon style={{ color: '#60A5FA' }} />;
};

const LocalDataIcon = () => {
  return <DefaultLocalDataIcon style={{ color: '#62CD80' }} />;
};

const WorkspaceType: FC<WorkspaceTypeProps> = ({ workspace }) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const isOwner = true;

  if (workspace.flavour === WorkspaceFlavour.LOCAL) {
    return (
      <p title={t['Local Workspace']()}>
        <LocalWorkspaceIcon />
        <span>{t['Local Workspace']()}</span>
      </p>
    );
  }

  return isOwner ? (
    <p title={t['Cloud Workspace']()}>
      <CloudWorkspaceIcon />
      <span>{t['Cloud Workspace']()}</span>
    </p>
  ) : (
    <p title={t['Joined Workspace']()}>
      <JoinedWorkspaceIcon />
      <span>{t['Joined Workspace']()}</span>
    </p>
  );
};

export type WorkspaceCardProps = {
  currentWorkspaceId: string | null;
  workspace: AffineCloudWorkspace | LocalWorkspace;
  onClick: (workspace: AffineCloudWorkspace | LocalWorkspace) => void;
  onSettingClick: (workspace: AffineCloudWorkspace | LocalWorkspace) => void;
};

export const WorkspaceCard: FC<WorkspaceCardProps> = ({
  workspace,
  onClick,
  onSettingClick,
  currentWorkspaceId,
}) => {
  const t = useAFFiNEI18N();
  const [name] = useBlockSuiteWorkspaceName(workspace.blockSuiteWorkspace);

  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(workspace);
      }, [onClick, workspace])}
      active={workspace.id === currentWorkspaceId}
    >
      <WorkspaceAvatar size={58} workspace={workspace} />

      <StyleWorkspaceInfo>
        <StyleWorkspaceTitle>{name}</StyleWorkspaceTitle>
        <WorkspaceType workspace={workspace} />
        {workspace.flavour === WorkspaceFlavour.LOCAL && (
          <p title={t['Available Offline']()}>
            <LocalDataIcon />
            <span>{t['Available Offline']()}</span>
          </p>
        )}
        {/* {workspace.flavour === WorkspaceFlavour.AFFINE && workspace.public && (
          <p title={t['Published to Web']()}>
            <PublishIcon />
            <span>{t['Published to Web']()}</span>
          </p>
        )} */}
      </StyleWorkspaceInfo>
      <StyledSettingLink
        className="setting-entry"
        onClick={e => {
          e.stopPropagation();
          onSettingClick(workspace);
        }}
      >
        <SettingsIcon />
      </StyledSettingLink>
    </StyledCard>
  );
};
