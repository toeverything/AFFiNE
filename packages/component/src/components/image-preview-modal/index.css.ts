import { baseTheme } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const imagePreviewModalStyle = style({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: baseTheme.zIndexModal,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // background: 'var(--affine-background-modal-color)',
  background: 'rgba(0,0,0,0.75)',
});

export const imagePreviewModalCloseButtonStyle = style({
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  height: '36px',
  width: '36px',
  borderRadius: '10px',
  top: '0.5rem',
  right: '0.5rem',
  background: 'var(--affine-white)',
  border: 'none',
  padding: '0.5rem',
  cursor: 'pointer',
  color: 'var(--affine-icon-color)',
  transition: 'background 0.2s ease-in-out',
  zIndex: 1,
});

export const imagePreviewModalGoStyle = style({
  color: 'var(--affine-white)',
  position: 'absolute',
  fontSize: '60px',
  lineHeight: '60px',
  fontWeight: 'bold',
  opacity: '0.2',
  padding: '0 15px',
  cursor: 'pointer',
});

export const imageNavigationControlStyle = style({
  display: 'flex',
  height: '100%',
  zIndex: 0,
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const imagePreviewModalContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  zIndex: 1,
  '@media': {
    'screen and (max-width: 768px)': {
      alignItems: 'center',
    },
  },
});

export const imagePreviewModalCenterStyle = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

export const imagePreviewModalCaptionStyle = style({
  color: 'var(--affine-white)',
  marginTop: '24px',
  '@media': {
    'screen and (max-width: 768px)': {
      textAlign: 'center',
    },
  },
});

export const imagePreviewActionBarStyle = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 0',
  backgroundColor: 'var(--affine-white)',
  borderRadius: '8px',
  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
  maxWidth: 'max-content',
});

export const groupStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--affine-white)',
  borderLeft: '1px solid #E3E2E4',
});

export const buttonStyle = style({
  paddingLeft: '10px',
  paddingRight: '10px',
});

export const scaleIndicatorStyle = style({
  margin: '0 8px',
});

export const imageBottomContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'fixed',
  bottom: '28px',
  zIndex: baseTheme.zIndexModal + 1,
});

export const captionStyle = style({
  maxWidth: '686px',
  color: 'var(--affine-white)',
  background: 'rgba(0,0,0,0.75)',
  padding: '10px',
  marginBottom: '21px',
});
