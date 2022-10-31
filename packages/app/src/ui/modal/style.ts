import { displayFlex, fixedCenter, styled } from '@/styles';
import ModalUnstyled from '@mui/base/ModalUnstyled';

export const StyledBackdrop = styled.div<{ open?: boolean }>(({ open }) => {
  return {
    zIndex: '-1',
    position: 'fixed',
    right: '0',
    bottom: '0',
    top: '0',
    left: '0',
    backgroundColor: 'rgba(58, 76, 92, 0.2)',
  };
});

export const StyledModal = styled(ModalUnstyled)(({ theme }) => {
  return {
    width: '100vw',
    height: '100vh',
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: theme.zIndex.modal,
    ...displayFlex('center', 'center'),
    '*': {
      '-webkit-tap-highlight-color': 'transparent',
      outline: 'none',
    },
  };
});
