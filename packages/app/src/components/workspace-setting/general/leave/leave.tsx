import Modal from '@/ui/modal';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledButtonContent,
} from './style';
import { ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  workspaceId: string;
  nextWorkSpaceId: string;
}

export const WorkspaceDelete = ({ open, onClose }: WorkspaceDeleteProps) => {
  const handleLeave = async () => {
    // TODO
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Leave Workspace</StyledModalHeader>
        <StyledTextContent>
          After you leave, you will not be able to access all the contents of
          this workspace.
        </StyledTextContent>
        <StyledButtonContent>
          <Button shape="circle" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleLeave}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            Leave
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceDelete;
