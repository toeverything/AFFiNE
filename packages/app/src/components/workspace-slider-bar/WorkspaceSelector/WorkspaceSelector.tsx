import { Popper } from '@/ui/popper';
import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { SelectorPopperContent } from './SelectorPopperContent';
import { useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import { WorkspaceType } from '@pathfinder/data-services';

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
      <SelectorWrapper>
        <Avatar alt="Affine" src={currentWorkspace?.meta.avatar || ''} />
        <WorkspaceName>
          {currentWorkspace?.meta.name ||
            (workspaceMeta?.type === WorkspaceType.Private && user
              ? user.name
              : 'AFFINE')}
        </WorkspaceName>
      </SelectorWrapper>
    </Popper>
  );
};
