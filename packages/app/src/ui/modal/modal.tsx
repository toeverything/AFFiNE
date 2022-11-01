import Fade from '@mui/material/Fade';
import { StyledModal, StyledBackdrop } from './style';
import { ModalUnstyledOwnProps } from '@mui/base/ModalUnstyled';

const Backdrop = ({
  open,
  ...other
}: {
  open?: boolean;
  className: string;
}) => {
  return (
    <Fade in={open}>
      <StyledBackdrop open={open} {...other} />
    </Fade>
  );
};

export type ModalProps = ModalUnstyledOwnProps;

export const Modal = (props: ModalProps) => {
  const { components, open, children, ...otherProps } = props;
  return (
    <div>
      <StyledModal {...otherProps} open={open} components={{ Backdrop }}>
        <Fade in={open}>{children}</Fade>
      </StyledModal>
    </div>
  );
};

export default Modal;
