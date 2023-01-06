import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { useEffect, useState } from 'react';
import { WorkspaceModal } from '@/components/workspace-modal';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { useTemporaryHelper } from '@/providers/temporary-helper-provider';
export const WorkspaceSelector = () => {
  const [workspaceListShow, setWorkspaceListShow] = useState(false);
  const { currentWorkspace, workspaceMetaList } = useTemporaryHelper();

  useEffect(() => {
    if (workspaceMetaList.length === 0) {
      setWorkspaceListShow(true);
    }
  });

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
          src={currentWorkspace.avatar}
        >
          <div
            style={{
              float: 'left',
            }}
          >
            <WorkspaceAvatar size={28} name={currentWorkspace.name} />
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
