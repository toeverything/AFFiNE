import { Modal } from '@affine/component';
import { ModalCloseButton } from '@affine/component';
import { Button } from '@affine/component';
import { useTranslation } from '@affine/i18n';

import {
  StyledButtonContent,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
} from './style';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
}

export const WorkspaceLeave = ({ open, onClose }: WorkspaceDeleteProps) => {
  // const { leaveWorkSpace } = useWorkspaceHelper();
  const { t } = useTranslation();
  const handleLeave = async () => {
    // await leaveWorkSpace();
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
