import { Modal, ModalCloseButton, ModalWrapper } from '../..';
export const TourModal = () => {
  return (
    <Modal
      open={true}
      onClose={() => {}}
      wrapperPosition={['center', 'center']}
      hideBackdrop
    >
      <ModalWrapper width={545} height={442}>
        <ModalCloseButton top={12} right={20} />
        <div>
          <div>Hyper merged whiteboard and docs</div>
          <video autoPlay muted loop width={300}>
            <source src="./switchVideo.mp4" type="video/mp4" />
            <source src="/switchVideo.webm" type="video/webm" />
            Easily switch between Page mode for structured document creation and
            Whiteboard mode for the freeform visual expression of creative
            ideas.
          </video>
          <div>Okay, I Like It !</div>
        </div>
      </ModalWrapper>
    </Modal>
  );
};

export default TourModal;
