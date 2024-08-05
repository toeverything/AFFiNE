import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { CollaborationIcon, SettingsIcon } from '@blocksuite/icons/rc';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { type MouseEvent, useCallback } from 'react';

import { Button } from '../../../ui/button';
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
  onEnableCloudClick?: (meta: WorkspaceMetadata) => void;
  isOwner?: boolean;
  openingId?: string | null;
  enableCloudText?: string;
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

export const WorkspaceCard = ({
  onClick,
  onSettingClick,
  onEnableCloudClick,
  openingId,
  currentWorkspaceId,
  meta,
  isOwner = true,
  enableCloudText = 'Enable Cloud',
  name,
}: WorkspaceCardProps) => {
  const isLocal = meta.flavour === WorkspaceFlavour.LOCAL;
  const displayName = name ?? UNTITLED_WORKSPACE_NAME;

  const onEnableCloud = useCallback(
    (e: MouseEvent) => {
      e.stopPropagation();
      onEnableCloudClick?.(meta);
    },
    [meta, onEnableCloudClick]
  );
  return (
    <div
      className={styles.card}
      data-active={meta.id === currentWorkspaceId}
      data-testid="workspace-card"
      onClick={useCallback(() => {
        onClick(meta);
      }, [onClick, meta])}
    >
      <WorkspaceAvatar
        key={meta.id}
        meta={meta}
        rounded={3}
        size={28}
        name={name}
        colorfulFallback
      />
      <div className={styles.workspaceInfo}>
        <div className={styles.workspaceTitle}>{displayName}</div>

        <div className={styles.actionButtons}>
          {isLocal ? (
            <Button
              loading={!!openingId && openingId === meta.id}
              disabled={!!openingId}
              className={styles.showOnCardHover}
              onClick={onEnableCloud}
            >
              {enableCloudText}
            </Button>
          ) : null}
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
