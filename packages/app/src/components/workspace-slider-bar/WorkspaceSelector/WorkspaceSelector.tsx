import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { useEffect, useState } from 'react';
import { WorkspaceModal } from '@/components/workspace-modal';
import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { useAppState } from '@/providers/app-state-provider';
export const WorkspaceSelector = () => {
  const [workspaceListShow, setWorkspaceListShow] = useState(false);
  const { currentWorkspace, workspaceList } = useAppState();

  useEffect(() => {
    if (workspaceList.length === 0) {
      setWorkspaceListShow(true);
    }
  }, [workspaceList]);
  return (
    <>
      <SelectorWrapper
        onClick={() => {
          setWorkspaceListShow(true);
        }}
        data-testid="current-workspace"
      >
        <Avatar
          alt="Affine"
          data-testid="workspace-avatar"
          // src={currentWorkspace?.avatar}
        >
          <div
            style={{
              float: 'left',
            }}
          >
            <WorkspaceUnitAvatar
              size={28}
              name={currentWorkspace?.name ?? 'AFFiNE'}
              workspaceUnit={currentWorkspace}
            />
          </div>
        </Avatar>
        <WorkspaceName data-testid="workspace-name">
          {currentWorkspace?.name ?? 'AFFiNE'}
        </WorkspaceName>
      </SelectorWrapper>
      <WorkspaceModal
        open={workspaceListShow}
        onClose={() => {
          setWorkspaceListShow(false);
        }}
      ></WorkspaceModal>
    </>
  );
};
