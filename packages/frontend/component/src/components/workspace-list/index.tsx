import type { WorkspaceMetadata } from '@toeverything/infra';
import { Suspense } from 'react';

import {
  WorkspaceCard,
  WorkspaceCardSkeleton,
} from '../../components/card/workspace-card';
import { workspaceItemStyle } from './index.css';

export interface WorkspaceListProps {
  disabled?: boolean;
  currentWorkspaceId?: string | null;
  items: WorkspaceMetadata[];
  openingId?: string | null;
  onClick: (workspace: WorkspaceMetadata) => void;
  onSettingClick: (workspace: WorkspaceMetadata) => void;
  onEnableCloudClick?: (meta: WorkspaceMetadata) => void;
  useIsWorkspaceOwner: (
    workspaceMetadata: WorkspaceMetadata
  ) => boolean | undefined;
  useWorkspaceName: (
    workspaceMetadata: WorkspaceMetadata
  ) => string | undefined;
}

interface SortableWorkspaceItemProps extends Omit<WorkspaceListProps, 'items'> {
  item: WorkspaceMetadata;
}

const SortableWorkspaceItem = ({
  item,
  openingId,
  useIsWorkspaceOwner,
  useWorkspaceName,
  currentWorkspaceId,
  onClick,
  onSettingClick,
  onEnableCloudClick,
}: SortableWorkspaceItemProps) => {
  const isOwner = useIsWorkspaceOwner?.(item);
  const name = useWorkspaceName?.(item);
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
      />
    </div>
  );
};

export const WorkspaceList = (props: WorkspaceListProps) => {
  const workspaceList = props.items;

  return workspaceList.map(item => (
    <Suspense fallback={<WorkspaceCardSkeleton />} key={item.id}>
      <SortableWorkspaceItem key={item.id} {...props} item={item} />
    </Suspense>
  ));
};
