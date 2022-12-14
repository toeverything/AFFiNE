import Modal from '@/ui/modal';
import Input from '@/ui/input';
import { Button } from '@/ui/button';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledInputContent,
  StyledButtonContent,
} from './style';
import { useState } from 'react';
import { ModalCloseButton } from '@/ui/modal';

export const WorkspaceCreate = () => {
  const [WorkspaceId, setWorkspaceId] = useState<string>('');
  const handlerInputChange = (workspaceId: string) => {
    setWorkspaceId(workspaceId);
  };
  return (
    <Modal open={true}>
      <StyledModalWrapper>
        <ModalCloseButton />
        <StyledModalHeader>Create new Workspace</StyledModalHeader>
        <StyledTextContent>
          Workspaces are shared environments where teams can collaborate. After
          creating a Workspace, you can invite others to join.
        </StyledTextContent>
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
            placeholder="Set a Workspace name"
            value={WorkspaceId}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <Button
            disabled={Boolean(WorkspaceId.length)}
            style={{ width: '260px' }}
          >
            Create
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceCreate;
