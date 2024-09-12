import { WorkspaceAvatar } from '@affine/component/workspace-avatar';
import { useWorkspaceInfo } from '@affine/core/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import { useService, WorkspaceService } from '@toeverything/infra';
import clsx from 'clsx';
import { forwardRef, type HTMLAttributes } from 'react';

import { card, dropdownIcon, label } from './card.css';

export interface CurrentWorkspaceCardProps
  extends HTMLAttributes<HTMLDivElement> {}

export const CurrentWorkspaceCard = forwardRef<
  HTMLDivElement,
  CurrentWorkspaceCardProps
>(function CurrentWorkspaceCard({ onClick, className, ...attrs }, ref) {
  const currentWorkspace = useService(WorkspaceService).workspace;
  const info = useWorkspaceInfo(currentWorkspace.meta);
  const name = info?.name ?? UNTITLED_WORKSPACE_NAME;

  return (
    <div
      ref={ref}
      onClick={onClick}
      className={clsx(card, className)}
      {...attrs}
    >
      <WorkspaceAvatar
        key={currentWorkspace.id}
        meta={currentWorkspace.meta}
        rounded={3}
        data-testid="workspace-avatar"
        size={40}
        name={name}
        colorfulFallback
      />
      <div className={label}>
        {name}
        <ArrowDownSmallIcon className={dropdownIcon} />
      </div>
    </div>
  );
});
