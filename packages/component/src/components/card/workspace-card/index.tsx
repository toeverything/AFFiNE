import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { RootWorkspaceMetadata } from '@affine/workspace/atom';
import { CollaborationIcon, SettingsIcon } from '@blocksuite/icons';
import { Skeleton } from '@mui/material';
import { Avatar } from '@toeverything/components/avatar';
import { Divider } from '@toeverything/components/divider';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceAvatarUrl } from '@toeverything/hooks/use-block-suite-workspace-avatar-url';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import { useAtomValue } from 'jotai/react';
import { useCallback } from 'react';

import {
  StyledCard,
  StyledIconContainer,
  StyledSettingLink,
  StyledWorkspaceInfo,
  StyledWorkspaceTitle,
  StyledWorkspaceTitleArea,
  StyledWorkspaceType,
  StyledWorkspaceTypeEllipse,
  StyledWorkspaceTypeText,
} from './styles';

export interface WorkspaceTypeProps {
  flavour: WorkspaceFlavour;
  isOwner: boolean;
}

const WorkspaceType = ({ flavour, isOwner }: WorkspaceTypeProps) => {
  const t = useAFFiNEI18N();
  if (flavour === WorkspaceFlavour.LOCAL) {
    return (
      <StyledWorkspaceType>
        <StyledWorkspaceTypeEllipse />
        <StyledWorkspaceTypeText>{t['Local']()}</StyledWorkspaceTypeText>
      </StyledWorkspaceType>
    );
  }

  return isOwner ? (
    <StyledWorkspaceType>
      <StyledWorkspaceTypeEllipse cloud={true} />
      <StyledWorkspaceTypeText>
        {t['com.affine.brand.affineCloud']()}
      </StyledWorkspaceTypeText>
    </StyledWorkspaceType>
  ) : (
    <StyledWorkspaceType>
      <StyledWorkspaceTypeEllipse cloud={true} />
      <StyledWorkspaceTypeText>
        {t['com.affine.brand.affineCloud']()}
      </StyledWorkspaceTypeText>
      <Divider
        orientation="vertical"
        size="thinner"
        style={{ margin: '0px 8px', height: '7px' }}
      />
      <Tooltip content={t['com.affine.workspaceType.joined']()}>
        <StyledIconContainer>
          <CollaborationIcon />
        </StyledIconContainer>
      </Tooltip>
    </StyledWorkspaceType>
  );
};

export interface WorkspaceCardProps {
  currentWorkspaceId: string | null;
  meta: RootWorkspaceMetadata;
  onClick: (workspaceId: string) => void;
  onSettingClick: (workspaceId: string) => void;
  isOwner?: boolean;
}

export const WorkspaceCardSkeleton = () => {
  return (
    <div>
      <StyledCard data-testid="workspace-card">
        <Skeleton variant="circular" width={28} height={28} />
        <Skeleton
          variant="rectangular"
          height={43}
          width={220}
          style={{ marginLeft: '12px' }}
        />
      </StyledCard>
    </div>
  );
};

export const WorkspaceCard = ({
  onClick,
  onSettingClick,
  currentWorkspaceId,
  meta,
  isOwner = true,
}: WorkspaceCardProps) => {
  const [workspaceAtom] = getBlockSuiteWorkspaceAtom(meta.id);
  const workspace = useAtomValue(workspaceAtom);
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
            size="small"
            className="setting-entry"
            onClick={e => {
              e.stopPropagation();
              onSettingClick(meta.id);
            }}
            withoutHoverStyle={true}
          >
            <SettingsIcon />
          </StyledSettingLink>
        </StyledWorkspaceTitleArea>
        <WorkspaceType isOwner={isOwner} flavour={meta.flavour} />
      </StyledWorkspaceInfo>
    </StyledCard>
  );
};
