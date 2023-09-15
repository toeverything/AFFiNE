import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { SettingsIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useStaticBlockSuiteWorkspace } from '@toeverything/infra/__internal__/react';
import { useCallback } from 'react';

import {
  StyledCard,
  StyledSettingLink,
  StyledWorkspaceInfo,
  StyledWorkspaceTitle,
  StyledWorkspaceTitleArea,
} from './styles';

export interface WorkspaceTypeProps {
  flavour: WorkspaceFlavour;
}

const WorkspaceType = ({ flavour }: WorkspaceTypeProps) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const isOwner = true;

  if (flavour === WorkspaceFlavour.LOCAL) {
    return (
      <p
        style={{ fontSize: '10px' }}
        title={t['com.affine.workspaceType.local']()}
      >
        <span>{t['com.affine.workspaceType.local']()}</span>
      </p>
    );
  }

  return isOwner ? (
    <p
      style={{ fontSize: '10px' }}
      title={t['com.affine.workspaceType.cloud']()}
    >
      <span>{t['com.affine.workspaceType.cloud']()}</span>
    </p>
  ) : (
    <p
      style={{ fontSize: '10px' }}
      title={t['com.affine.workspaceType.joined']()}
    >
      <span>{t['com.affine.workspaceType.joined']()}</span>
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
  const [workspaceAvatar] = useBlockSuiteWorkspaceAvatarUrl(workspace);

  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(meta.id);
      }, [onClick, meta.id])}
      active={workspace.id === currentWorkspaceId}
    >
      <Avatar size={28} url={workspaceAvatar} name={name} colorfulFallback />
      <StyledWorkspaceInfo>
        <StyledWorkspaceTitleArea style={{ display: 'flex' }}>
          <StyledWorkspaceTitle>{name}</StyledWorkspaceTitle>

          <StyledSettingLink
            className="setting-entry"
            onClick={e => {
              e.stopPropagation();
              onSettingClick(meta.id);
            }}
            withoutHoverStyle={true}
          >
            <SettingsIcon style={{ margin: '0px' }} />
          </StyledSettingLink>
        </StyledWorkspaceTitleArea>
        {/* {meta.flavour === WorkspaceFlavour.LOCAL && (
          <p title={t['com.affine.workspaceType.offline']()}>
            <LocalDataIcon />
            <WorkspaceType flavour={meta.flavour} />
          </p>

        )} */}
        <WorkspaceType flavour={meta.flavour} />
      </StyledWorkspaceInfo>
    </StyledCard>
  );
};
