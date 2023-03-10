import { PermissionType } from '@affine/datacenter';
import { useTranslation } from '@affine/i18n';
import { SettingsIcon } from '@blocksuite/icons';
import React, { useCallback } from 'react';

import { useBlockSuiteWorkspaceName } from '../../../hooks/use-blocksuite-workspace-name';
import { RemWorkspace, RemWorkspaceFlavour } from '../../../shared';
import {
  CloudWorkspaceIcon,
  JoinedWorkspaceIcon,
  LocalDataIcon,
  LocalWorkspaceIcon,
  PublishIcon,
} from '../icons';
import { WorkspaceAvatar } from '../workspace-avatar';
import {
  StyledCard,
  StyledSettingLink,
  StyleWorkspaceInfo,
  StyleWorkspaceTitle,
} from './styles';
export type WorkspaceTypeProps = {
  workspace: RemWorkspace;
};

const WorkspaceType: React.FC<WorkspaceTypeProps> = ({ workspace }) => {
  const { t } = useTranslation();
  let isOwner = true;
  if (workspace.flavour === RemWorkspaceFlavour.AFFINE) {
    isOwner = workspace.permission === PermissionType.Owner;
  } else if (workspace.flavour === RemWorkspaceFlavour.LOCAL) {
    isOwner = true;
  }

  if (workspace.flavour === RemWorkspaceFlavour.LOCAL) {
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

export type WorkspaceCardProps = {
  currentWorkspaceId: string | null;
  workspace: RemWorkspace;
  onClick: (workspace: RemWorkspace) => void;
  onSettingClick: (workspace: RemWorkspace) => void;
};

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({
  workspace,
  onClick,
  onSettingClick,
  currentWorkspaceId,
}) => {
  const { t } = useTranslation();
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
        {workspace.flavour === RemWorkspaceFlavour.LOCAL && (
          <p title={t('Available Offline')}>
            <LocalDataIcon />
            <span>{t('Available Offline')}</span>
          </p>
        )}
        {workspace.flavour === RemWorkspaceFlavour.AFFINE &&
          workspace.public && (
            <p title={t('Published to Web')}>
              <PublishIcon />
              <span>{t('Published to Web')}</span>
            </p>
          )}
      </StyleWorkspaceInfo>
      <StyledSettingLink
        className="setting-entry"
        hoverBackground="#fff"
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
