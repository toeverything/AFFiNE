import { createWorkspace } from '@pathfinder/data-services';
import Modal from '@/ui/modal';
import Input from '@/ui/input';
import { Button } from '@/ui/button';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledInputContent,
  StyledButtonContent,
  StyledButton,
} from './style';
import { useState } from 'react';
import { ModalCloseButton } from '@/ui/modal';
import router from 'next/router';

interface WorkspaceCreateProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceCreate = ({ open, onClose }: WorkspaceCreateProps) => {
  const [workspaceName, setWorkspaceId] = useState<string>('');
  const [canCreate, setCanCreate] = useState<boolean>(false);
  const handlerInputChange = (workspaceName: string) => {
    setWorkspaceId(workspaceName);
  };
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Create new Workspace</StyledModalHeader>
        <StyledTextContent>
          Workspaces are shared environments where teams can collaborate. After
          creating a Workspace, you can invite others to join.
        </StyledTextContent>
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
            placeholder="Set a Workspace name"
            value={workspaceName}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <StyledButton
            disabled={!workspaceName.length || canCreate}
            onClick={() => {
              setCanCreate(true);
              createWorkspace({ name: workspaceName, avatar: '' })
                .then(data => {
                  // @ts-ignore
                  router.push(`/workspace/${data.created_at}`);
                  onClose();
                })
                .catch(err => {
                  console.log(err, 'err');
                })
                .finally(() => {
                  setCanCreate(false);
                });
            }}
          >
            Create
          </StyledButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceCreate;
