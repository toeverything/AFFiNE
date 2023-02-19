import { useCallback, useState } from 'react';

import { WorkspaceUnitAvatar } from '@/components/workspace-avatar';
import { WorkspaceModal } from '@/components/workspace-modal';
import { useDataCenter, useGlobalState } from '@/store/app';

import { SelectorWrapper, WorkspaceName } from './styles';

export const WorkspaceSelector = () => {
  const [workspaceListShow, setWorkspaceListShow] = useState(false);
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const dataCenter = useDataCenter();

  if (dataCenter.workspaces.length === 0) {
    setWorkspaceListShow(true);
  }
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
            name={currentWorkspace?.name ?? 'Demo Workspace'}
            workspaceUnit={currentWorkspace}
          />
        </div>
        <WorkspaceName data-testid="workspace-name">
          {currentWorkspace?.name ?? 'Demo Workspace'}
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
