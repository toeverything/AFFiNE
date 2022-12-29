import Modal from '@/ui/modal';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledButtonContent,
} from './style';
import { ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { leaveWorkspace } from '@affine/datacenter';
import { useRouter } from 'next/router';
import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  workspaceId: string;
  nextWorkSpaceId: string;
}

export const WorkspaceLeave = ({
  open,
  onClose,
  nextWorkSpaceId,
  workspaceId,
}: WorkspaceDeleteProps) => {
  const router = useRouter();
  const { refreshWorkspacesMeta } = useAppState();
  const handleLeave = async () => {
    await leaveWorkspace({ id: workspaceId });
    router.push(`/workspace/${nextWorkSpaceId}`);
    refreshWorkspacesMeta();
    onClose();
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

export default WorkspaceLeave;
