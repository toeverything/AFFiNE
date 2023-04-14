import { useTranslation } from '@affine/i18n';
import type { Page } from '@blocksuite/store';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-blocksuite-workspace-page-is-public';
import { useCallback } from 'react';

import { Modal, ModalCloseButton, toast } from '../../..';
import {
  StyledButton,
  StyledButtonContent,
  StyledDangerButton,
  StyledModalHeader,
  StyledModalWrapper,
  StyledTextContent,
} from './style';

export type PublicLinkDisableProps = {
  page: Page;
  open: boolean;
  onClose: () => void;
};

export const PublicLinkDisableModal = ({
  page,
  open,
  onClose,
}: PublicLinkDisableProps) => {
  const { t } = useTranslation();
  const [, setIsPublic] = useBlockSuiteWorkspacePageIsPublic(page);
  const handleDisable = useCallback(() => {
    setIsPublic(false);
    toast('Successfully disabled', {
      portal: document.body,
    });
    onClose();
  }, [onClose, setIsPublic]);
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} top={12} right={12} />
        <StyledModalHeader>{t('Disable Public Link ?')}</StyledModalHeader>

        <StyledTextContent>
          {t('Disable Public Link Description')}
        </StyledTextContent>

        <StyledButtonContent>
          <StyledButton onClick={onClose}>{t('Cancel')}</StyledButton>
          <StyledDangerButton
            data-testid="disable-public-link-confirm-button"
            onClick={handleDisable}
            style={{ marginLeft: '24px' }}
          >
            {t('Disable')}
          </StyledDangerButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};
