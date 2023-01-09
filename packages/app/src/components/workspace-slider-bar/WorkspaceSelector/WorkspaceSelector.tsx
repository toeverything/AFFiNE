import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { useEffect, useState } from 'react';
import { WorkspaceModal } from '@/components/workspace-modal';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { useAppState } from '@/providers/app-state-provider';
export const WorkspaceSelector = () => {
  const [workspaceListShow, setWorkspaceListShow] = useState(false);
  const { currentMetaWorkSpace, workspaceList } = useAppState();
  console.log('currentMetaWorkSpace: ', currentMetaWorkSpace);

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
          src={currentMetaWorkSpace?.avatar}
        >
          <div
            style={{
              float: 'left',
            }}
          >
            <WorkspaceAvatar
              size={28}
              name={currentMetaWorkSpace?.name ?? 'AFFiNE'}
            />
          </div>
        </Avatar>
        <WorkspaceName data-testid="workspace-name">
          {currentMetaWorkSpace?.name ?? 'AFFiNE'}
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
