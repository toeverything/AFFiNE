import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CollaborationIcon, SettingsIcon } from '@blocksuite/icons';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { useCallback } from 'react';

import { Avatar } from '../../../ui/avatar';
import { Divider } from '../../../ui/divider';
import { Skeleton } from '../../../ui/skeleton';
import { Tooltip } from '../../../ui/tooltip';
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
  currentWorkspaceId?: string | null;
  meta: WorkspaceMetadata;
  onClick: (metadata: WorkspaceMetadata) => void;
  onSettingClick: (metadata: WorkspaceMetadata) => void;
  isOwner?: boolean;
  avatar?: string;
  name?: string;
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
  name,
  avatar,
}: WorkspaceCardProps) => {
  const displayName = name ?? UNTITLED_WORKSPACE_NAME;
  return (
    <StyledCard
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(meta);
      }, [onClick, meta])}
      active={meta.id === currentWorkspaceId}
    >
      <Avatar size={28} url={avatar} name={name} colorfulFallback />
      <StyledWorkspaceInfo>
        <StyledWorkspaceTitleArea style={{ display: 'flex' }}>
          <StyledWorkspaceTitle>{displayName}</StyledWorkspaceTitle>

          <StyledSettingLink
            size="small"
            className="setting-entry"
            onClick={e => {
              e.stopPropagation();
              onSettingClick(meta);
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
