import { Modal as ModalUnstyled } from '@mui/base/Modal';
import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export const StyledBackdrop = styled('div')(() => {
  return {
    zIndex: '-1',
    position: 'fixed',
    right: '0',
    bottom: '0',
    top: '0',
    left: '0',
    backgroundColor: 'var(--affine-background-modal-color)',
  };
});

export const StyledModal = styled(ModalUnstyled, {
  shouldForwardProp: prop => {
    return !['justifyContent', 'alignItems'].includes(prop as string);
  },
})<{
  alignItems: CSSProperties['alignItems'];
  justifyContent: CSSProperties['justifyContent'];
}>(({ alignItems, justifyContent }) => {
  return {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems,
    justifyContent,
    position: 'fixed',
    left: '0',
    top: '0',
    zIndex: 'var(--affine-z-index-modal)',
    WebkitAppRegion: 'no-drag',
    '*': {
      WebkitTapHighlightColor: 'transparent',
      outline: 'none',
    },
  };
});

export const StyledModalFooter = styled('div')(() => {
  return {
    marginTop: 40,
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'center',
  };
});

export const StyledModalTitle = styled('div')(() => {
  return {
    fontWeight: 600,
    fontSize: 'var(--affine-font-h-6)',
  };
});
export const StyledModalContent = styled('div')(() => {
  return {
    fontSize: 'var(--affine-font-base)',
    lineHeight: '24px',
    marginTop: '12px',
  };
});
