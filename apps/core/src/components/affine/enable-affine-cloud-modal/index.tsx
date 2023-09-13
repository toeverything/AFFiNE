import { Modal, ModalWrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons';
import { useSessionStatus } from '@toeverything/auth/react';
import { Button, IconButton } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { authAtom } from '../../../atoms';
import { setOnceSignedInEventAtom } from '../../../atoms/event';
import { ButtonContainer, Content, Header, StyleTips, Title } from './style';

interface EnableAffineCloudModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const EnableAffineCloudModal = ({
  onConfirm: propsOnConfirm,
  open,
  onClose,
}: EnableAffineCloudModalProps) => {
  const t = useAFFiNEI18N();
  const loginStatus = useSessionStatus();
  const setAuthAtom = useSetAtom(authAtom);
  const setOnceSignedInEvent = useSetAtom(setOnceSignedInEventAtom);

  const confirm = useCallback(async () => {
    return propsOnConfirm();
  }, [propsOnConfirm]);

  const onConfirm = useCallback(() => {
    if (loginStatus === 'unauthenticated') {
      setAuthAtom(prev => ({
        ...prev,
        openModal: true,
      }));
      setOnceSignedInEvent(confirm);
    }
    if (loginStatus === 'authenticated') {
      return propsOnConfirm();
    }
  }, [confirm, loginStatus, propsOnConfirm, setAuthAtom, setOnceSignedInEvent]);

  return (
    <Modal open={open} onClose={onClose} data-testid="logout-modal">
      <ModalWrapper width={480}>
        <Header>
          <Title>{t['Enable AFFiNE Cloud']()}</Title>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <StyleTips>{t['Enable AFFiNE Cloud Description']()}</StyleTips>
          <ButtonContainer>
            <div>
              <Button onClick={onClose} block>
                {t['com.affine.enableAffineCloudModal.button.cancel']()}
              </Button>
            </div>
            <div>
              <Button
                data-testid="confirm-enable-affine-cloud-button"
                type="primary"
                block
                onClick={onConfirm}
              >
                {loginStatus === 'authenticated'
                  ? t['Enable']()
                  : t['Sign in and Enable']()}
              </Button>
            </div>
          </ButtonContainer>
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
