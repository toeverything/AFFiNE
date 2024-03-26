import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { CollaborationIcon, SettingsIcon } from '@blocksuite/icons';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { useCallback } from 'react';

import { Avatar, type AvatarProps } from '../../../ui/avatar';
import { Skeleton } from '../../../ui/skeleton';
import * as styles from './styles.css';

export interface WorkspaceTypeProps {
  flavour: WorkspaceFlavour;
  isOwner: boolean;
}

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
      <div className={styles.card} data-testid="workspace-card">
        <Skeleton variant="circular" width={28} height={28} />
        <Skeleton
          variant="rectangular"
          height={43}
          width={220}
          style={{ marginLeft: '12px' }}
        />
      </div>
    </div>
  );
};

const avatarImageProps = {
  style: { borderRadius: 3, overflow: 'hidden' },
} satisfies AvatarProps['imageProps'];
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
    <div
      className={styles.card}
      data-active={meta.id === currentWorkspaceId}
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(meta);
      }, [onClick, meta])}
    >
      <Avatar
        imageProps={avatarImageProps}
        fallbackProps={avatarImageProps}
        size={28}
        url={avatar}
        name={name}
        colorfulFallback
      />
      <div className={styles.workspaceInfo}>
        <div className={styles.workspaceTitle}>{displayName}</div>

        <div className={styles.actionButtons}>
          {isOwner ? null : <CollaborationIcon />}
          <div
            className={styles.settingButton}
            onClick={e => {
              e.stopPropagation();
              onSettingClick(meta);
            }}
          >
            <SettingsIcon width={16} height={16} />
          </div>
        </div>
      </div>
    </div>
  );
};
