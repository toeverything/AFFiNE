import {
  WorkspaceCard,
  WorkspaceCardSkeleton,
} from '@affine/component/card/workspace-card';
import {
  useWorkspaceAvatar,
  useWorkspaceInfo,
  useWorkspaceName,
} from '@affine/core/hooks/use-workspace-info';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { Suspense } from 'react';

import { workspaceItemStyle } from './index.css';

export interface WorkspaceListProps {
  disabled?: boolean;
  currentWorkspaceId?: string | null;
  items: WorkspaceMetadata[];
  openingId?: string | null;
  onClick: (workspace: WorkspaceMetadata) => void;
  onSettingClick: (workspace: WorkspaceMetadata) => void;
  onEnableCloudClick?: (meta: WorkspaceMetadata) => void;
}

interface WorkspaceItemProps extends Omit<WorkspaceListProps, 'items'> {
  item: WorkspaceMetadata;
}

const WorkspaceItem = ({
  item,
  openingId,
  currentWorkspaceId,
  onClick,
  onSettingClick,
  onEnableCloudClick,
}: WorkspaceItemProps) => {
  const isOwner = useWorkspaceInfo(item)?.isOwner;
  const avatar = useWorkspaceAvatar(item);
  const name = useWorkspaceName(item);
  return (
    <div className={workspaceItemStyle} data-testid="draggable-item">
      <WorkspaceCard
        currentWorkspaceId={currentWorkspaceId}
        meta={item}
        onClick={onClick}
        onSettingClick={onSettingClick}
        onEnableCloudClick={onEnableCloudClick}
        openingId={openingId}
        isOwner={isOwner}
        name={name}
        avatar={avatar}
      />
    </div>
  );
};

export const WorkspaceList = (props: WorkspaceListProps) => {
  const workspaceList = props.items;

  return workspaceList.map(item => (
    <Suspense fallback={<WorkspaceCardSkeleton />} key={item.id}>
      <WorkspaceItem key={item.id} {...props} item={item} />
    </Suspense>
  ));
};
