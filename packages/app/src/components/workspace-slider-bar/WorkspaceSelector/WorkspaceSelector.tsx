import { Avatar, WorkspaceName, SelectorWrapper } from './styles';
import { useEffect, useState } from 'react';
// import { AffineIcon } from '../icons/icons';
import { WorkspaceModal } from '@/components/workspace-modal';
import { getActiveWorkspace, getWorkspaces } from '@/hooks/mock-data/mock';
import { stringToColour } from '@/utils';
export const WorkspaceSelector = () => {
  const [workspaceListShow, setWorkspaceListShow] = useState(false);
  const [workspace, setWorkSpace] = useState(getActiveWorkspace());
  useEffect(() => {
    setWorkspace();
  }, [workspaceListShow]);
  useEffect(() => {
    const workspaceList = getWorkspaces();
    if (workspaceList.length === 0) {
      setWorkspaceListShow(true);
    }
  });
  const setWorkspace = () => {
    const workspace = getActiveWorkspace();
    setWorkSpace(workspace);
  };

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
          src={workspace.avatar}
        >
          <div
            style={{
              float: 'left',
              width: '28px',
              height: '28px',
              border: '1px solid #fff',
              color: '#fff',
              fontSize: '14px',
              padding: '5px 0 0 5px;',
              background: stringToColour(workspace?.name ?? 'AFFiNE'),
              borderRadius: '50%',
              textAlign: 'center',
              lineHeight: '28px',
            }}
          >
            {(workspace?.name ?? 'AFFiNE').substring(0, 1)}
          </div>
        </Avatar>
        <WorkspaceName data-testid="workspace-name">
          {workspace?.name ?? 'AFFiNE'}
        </WorkspaceName>
      </SelectorWrapper>
      <WorkspaceModal
        open={workspaceListShow}
        onClose={() => {
          setWorkspaceListShow(false);
          setWorkspace();
        }}
      ></WorkspaceModal>
    </>
  );
};
