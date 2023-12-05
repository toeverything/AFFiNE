import { createVar, style } from '@vanilla-extract/css';

export const widthVar = createVar('widthVar');
export const heightVar = createVar('heightVar');
export const minHeightVar = createVar('minHeightVar');

export const modalOverlay = style({
  position: 'fixed',
  inset: 0,
  backgroundColor: 'var(--affine-background-modal-color)',
  zIndex: 'var(--affine-z-index-modal)',
});

export const modalContentWrapper = style({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 'var(--affine-z-index-modal)',
});

export const modalContent = style({
  vars: {
    [widthVar]: '',
    [heightVar]: '',
    [minHeightVar]: '',
  },
  width: widthVar,
  height: heightVar,
  minHeight: minHeightVar,
  boxSizing: 'border-box',
  fontSize: 'var(--affine-font-base)',
  fontWeight: '400',
  lineHeight: '1.6',
  padding: '20px 24px',
  position: 'relative',
  backgroundColor: 'var(--affine-background-overlay-panel-color)',
  boxShadow: 'var(--affine-popover-shadow)',
  borderRadius: '12px',
  maxHeight: 'calc(100vh - 32px)',
  // :focus-visible will set outline
  outline: 'none',
});

export const closeButton = style({
  position: 'absolute',
  top: '22px',
  right: '20px',
});

export const modalHeader = style({
  fontSize: 'var(--affine-font-h-6)',
  fontWeight: '600',
  lineHeight: '1.45',
  marginBottom: '12px',
});
export const modalDescription = style({
  // marginBottom: '20px',
});

export const modalFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  paddingTop: '40px',
  marginTop: 'auto',
  gap: '20px',
  selectors: {
    '&.modalFooterWithChildren': {
      paddingTop: '20px',
    },
  },
});

export const confirmModalContent = style({
  marginTop: '12px',
  marginBottom: '20px',
});

export const confirmModalContainer = style({
  display: 'flex',
  flexDirection: 'column',
});
