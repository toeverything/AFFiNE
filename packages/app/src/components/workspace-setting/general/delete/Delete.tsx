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

import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceUnit;
}

export const WorkspaceDelete = ({
  open,
  onClose,
  workspace,
}: WorkspaceDeleteProps) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const router = useRouter();
  const { deleteWorkSpace } = useWorkspaceHelper();
  const handlerInputChange = (workspaceName: string) => {
    setDeleteStr(workspaceName);
  };

  const handleDelete = async () => {
    await deleteWorkSpace();
    onClose();
    router.push(`/workspace`);
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Delete Workspace</StyledModalHeader>
        {workspace.provider === 'local' ? (
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
