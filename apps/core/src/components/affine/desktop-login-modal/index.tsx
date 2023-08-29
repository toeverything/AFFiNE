import { Modal, ModalWrapper } from '@affine/component';

export const DesktopLoginModal = ({
  signingEmail,
}: {
  signingEmail?: string;
}) => {
  return (
    <Modal open={!!signingEmail}>
      <ModalWrapper width={560} style={{ padding: '10px' }}>
        Logging in ... {signingEmail}
      </ModalWrapper>
    </Modal>
  );
};
