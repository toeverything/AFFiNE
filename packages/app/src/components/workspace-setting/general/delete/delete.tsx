import Modal from '@/ui/modal';
import Input from '@/ui/input';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledInputContent,
  StyledButtonContent,
  StyledWorkspaceName,
} from './style';
import { useState } from 'react';
import { ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useRouter } from 'next/router';
import {
  deleteWorkspace,
  getWorkspaces,
  Workspace,
} from '@/hooks/mock-data/mock';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspace: Workspace;
}

export const WorkspaceDelete = ({
  open,
  onClose,
  workspace,
}: WorkspaceDeleteProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const router = useRouter();

  const handlerInputChange = (workspaceName: string) => {
    setDeleteStr(workspaceName);
  };

  const handleDelete = async () => {
    // const dc = await getDataCenter();
    // await dc.apis.deleteWorkspace({ id: workspaceId });
    // router.push(`/workspace/${nextWorkSpaceId}`);
    deleteWorkspace(workspace.id);
    const workspaceList = getWorkspaces();
    if (workspaceList.length) {
      router.push(`/workspace/${workspaceList[0].id}`);
    } else {
      router.push(`/workspace`);
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Delete Workspace</StyledModalHeader>
        {workspace.type === 'local' ? (
          <StyledTextContent>
            Deleting (
            <StyledWorkspaceName>{workspace.name}</StyledWorkspaceName>) cannot
            be undone, please proceed with caution. along with all its content.
          </StyledTextContent>
        ) : (
          <StyledTextContent>
            Deleting (
            <StyledWorkspaceName>{workspace.name}</StyledWorkspaceName>) will
            delete both local and cloud data, this operation cannot be undone,
            please proceed with caution.
          </StyledTextContent>
        )}
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
            placeholder="Please type “Delete” to confirm"
            value={deleteStr}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <Button shape="circle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={deleteStr.toLowerCase() !== 'delete'}
            onClick={handleDelete}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            Delete
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceDelete;
