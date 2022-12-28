import { Popper } from '@/ui/popper';
import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { SelectorPopperContent } from './SelectorPopperContent';
import { useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceType } from '@affine/data-services';
import { AffineIcon } from '../icons/icons';

export const WorkspaceSelector = () => {
  const [isShow, setIsShow] = useState(false);
  const { currentWorkspace, workspacesMeta, currentWorkspaceId, user } =
    useAppState();
  const workspaceMeta = workspacesMeta.find(
    meta => String(meta.id) === String(currentWorkspaceId)
  );
  return (
    <Popper
      content={<SelectorPopperContent isShow={isShow} />}
      zIndex={1000}
      placement="bottom-start"
      trigger="click"
      onVisibleChange={setIsShow}
    >
      <SelectorWrapper data-testid="current-workspace">
        <Avatar
          alt="Affine"
          data-testid="workspace-avatar"
          src={
            workspaceMeta?.type === WorkspaceType.Private
              ? user
                ? user.avatar_url
                : ''
              : currentWorkspace?.meta.avatar &&
                `/api/blob/${currentWorkspace?.meta.avatar}`
          }
        >
          {workspaceMeta?.type === WorkspaceType.Private && user ? (
            user?.name[0]
          ) : (
            <AffineIcon />
          )}
        </Avatar>
        <WorkspaceName data-testid="workspace-name">
          {workspaceMeta?.type === WorkspaceType.Private
            ? user
              ? user.name
              : 'AFFiNE'
            : currentWorkspace?.meta.name || 'AFFiNE'}
        </WorkspaceName>
      </SelectorWrapper>
    </Popper>
  );
};
