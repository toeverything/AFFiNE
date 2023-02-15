import { WorkspaceName, SelectorWrapper } from './styles';
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
        <div data-testid="workspace-avatar">
          <WorkspaceUnitAvatar
            style={{
              flexShrink: 0,
            }}
            size={32}
            name={currentWorkspace?.name ?? 'AFFiNE Test'}
            workspaceUnit={currentWorkspace}
          />
        </div>
        <WorkspaceName data-testid="workspace-name">
          {currentWorkspace?.name ?? 'AFFiNE Test'}
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
