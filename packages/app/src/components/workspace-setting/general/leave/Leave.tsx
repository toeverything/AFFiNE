import Modal from '@/ui/modal';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledButtonContent,
} from './style';
import { ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useTranslation } from '@affine/i18n';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
// import { getDataCenter } from '@affine/datacenter';
// import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceLeave = ({ open, onClose }: WorkspaceDeleteProps) => {
  const { leaveWorkSpace } = useWorkspaceHelper();
  const { t } = useTranslation();
  const handleLeave = async () => {
    await leaveWorkSpace();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>{t('Leave Workspace')}</StyledModalHeader>
        <StyledTextContent>
          {t('Leave Workspace Description')}
        </StyledTextContent>
        <StyledButtonContent>
          <Button shape="circle" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            onClick={handleLeave}
            type="danger"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            {t('Leave')}
          </Button>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceLeave;
