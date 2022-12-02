import { absoluteCenter, displayFlex, fixedCenter, styled } from '@/styles';
import ModalUnstyled from '@mui/base/ModalUnstyled';
import { ModalCloseButtonProps } from '@/ui/modal/modal-close-button';

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
      WebkitTapHighlightColor: 'transparent',
      outline: 'none',
    },
  };
});

export const StyledCloseButton = styled.button<
  Pick<ModalCloseButtonProps, 'size' | 'triggerSize' | 'top' | 'right'>
>(({ theme, triggerSize = [], size = [32, 32], top, right }) => {
  const [triggerWidth, triggerHeight] = triggerSize;
  const [width, height] = size;

  return {
    width: triggerWidth ?? width * 2,
    height: triggerHeight ?? height * 2,
    color: theme.colors.iconColor,
    cursor: 'pointer',
    ...displayFlex('center', 'center'),
    position: 'absolute',
    top: top ?? 0,
    right: right ?? 0,

    // TODO: we need to add @emotion/babel-plugin
    '::after': {
      content: '""',
      width,
      height,
      borderRadius: '6px',
      ...absoluteCenter({ horizontal: true, vertical: true }),
    },
    ':hover': {
      color: theme.colors.primaryColor,
      '::after': {
        background: theme.colors.hoverBackground,
      },
    },
    svg: {
      position: 'relative',
      zIndex: 1,
    },
  };
});
