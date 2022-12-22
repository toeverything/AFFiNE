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
import { deleteWorkspace } from '@pathfinder/data-services';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  workspaceId: string;
  nextWorkSpaceId: string;
}

export const WorkspaceDelete = ({
  open,
  onClose,
  workspaceId,
  workspaceName,
  nextWorkSpaceId,
}: WorkspaceDeleteProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const router = useRouter();
  const { refreshWorkspacesMeta } = useAppState();

  const handlerInputChange = (workspaceName: string) => {
    setDeleteStr(workspaceName);
  };

  const handleDelete = async () => {
    await deleteWorkspace({ id: workspaceId });
    router.push(`/workspace/${nextWorkSpaceId}`);
    refreshWorkspacesMeta();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Delete Workspace</StyledModalHeader>
        <StyledTextContent>
          This action cannot be undone. This will permanently delete (
          <StyledWorkspaceName>{workspaceName}</StyledWorkspaceName>) along with
          all its content.
        </StyledTextContent>
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
            placeholder="Please type “delete” to confirm"
            value={deleteStr}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <Button shape="circle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={deleteStr !== 'delete'}
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
