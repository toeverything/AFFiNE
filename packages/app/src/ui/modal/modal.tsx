import Fade from '@mui/material/Fade';
import { StyledModal, StyledBackdrop, StyledWrapper } from './styles';
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
    components,
    open,
    children,
    ...otherProps
  } = props;
  const [vertical, horizontal] = wrapperPosition;
  return (
    <StyledModal {...otherProps} open={open} components={{ Backdrop }}>
      <Fade in={open}>
        <StyledWrapper
          alignItems={transformConfig[vertical]}
          justifyContent={transformConfig[horizontal]}
        >
          {children}
        </StyledWrapper>
      </Fade>
    </StyledModal>
  );
};

export default Modal;
