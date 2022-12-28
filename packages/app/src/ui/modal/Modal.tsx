import Fade from '@mui/material/Fade';
import { StyledModal, StyledBackdrop } from './styles';
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
      <StyledBackdrop {...other} />
    </Fade>
  );
};

export type ModalProps = {
  wrapperPosition?: ['top' | 'bottom' | 'center', 'left' | 'right' | 'center'];
} & ModalUnstyledOwnProps;

const transformConfig = {
  top: 'flex-start',
  bottom: 'flex-end',
  center: 'center',
  left: 'flex-start',
  right: 'flex-end',
};

export const Modal = (props: ModalProps) => {
  const {
    wrapperPosition = ['center', 'center'],
    open,
    children,
    ...otherProps
  } = props;
  const [vertical, horizontal] = wrapperPosition;
  return (
    <StyledModal
      {...otherProps}
      open={open}
      components={{ Backdrop }}
      alignItems={transformConfig[vertical]}
      justifyContent={transformConfig[horizontal]}
    >
      <Fade in={open}>{children}</Fade>
    </StyledModal>
  );
};

export default Modal;
