import Modal from '@/ui/modal';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledButtonContent,
} from './style';
import { ModalCloseButton } from '@/ui/modal';
import { Button } from '@/ui/button';
import { useTranslation } from 'react-i18next';
// import { getDataCenter } from '@affine/datacenter';
// import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceDeleteProps {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  workspaceId: string;
}

export const WorkspaceLeave = ({
  open,
  onClose,
  workspaceId,
}: WorkspaceDeleteProps) => {
  const { t } = useTranslation();
  console.log('workspaceId: ', workspaceId);
  // const router = useRouter();
  // const { refreshWorkspacesMeta } = useAppState();
  const handleLeave = async () => {
    // const dc = await getDataCenter();
    // await dc.apis.leaveWorkspace({ id: workspaceId });
    // // router.push(`/workspace/${nextWorkSpaceId}`);
    // refreshWorkspacesMeta();
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
