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
  background: 'var(--affine-background-modal-color)',
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
});

export const imagePreviewModalGoStyle = style({
  height: '50%',
  color: 'var(--affine-white)',
  position: 'absolute',
  fontSize: '60px',
  lineHeight: '60px',
  fontWeight: 'bold',
  display: 'flex',
  alignItems: 'center',
  opacity: '0.2',
  padding: '0 15px',
  cursor: 'pointer',
});

export const imagePreviewModalContainerStyle = style({
  position: 'absolute',
  top: '20%',
  bottom: '20%',
  minHeight: '120%',
  display: 'flex',
  flexDirection: 'column',
});

export const imagePreviewModalImageStyle = style({
  background: 'transparent',
  maxWidth: '686px',
  objectFit: 'contain',
  objectPosition: 'center',
  borderRadius: '4px',
  marginBottom: '24px',
});

export const imagePreviewModalCaptionStyle = style({
  color: 'var(--affine-white)',
});

export const imagePreviewModalActionsStyle = style({
  position: 'absolute',
  bottom: '28px',
  background: 'var(--affine-white)',
});

export const imagePreviewTitleBarStyle = style({
  position: 'fixed',
  bottom: 0,
  width: '100%',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 0',
  backgroundColor: 'white',
  borderTopLeftRadius: '8px',
  borderTopRightRadius: '8px',
  zIndex: baseTheme.zIndexModal + 1,
});

export const groupStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: '24px',
  padding: '8px',
  backgroundColor: 'white',
  borderRadius: '8px',
});

export const groupDividerStyle = style({
  borderRight: '24px solid transparent',
});

export const buttonStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '8px',
  backgroundColor: 'transparent',
  border: 'none',
  color: 'black',
  fontSize: '14px',
  cursor: 'pointer',

  ':hover': {
    backgroundColor: '#e1e1e1',
  },
});

export const scaleIndicatorStyle = style({
  margin: '0 8px',
});

export const deleteButtonStyle = style({
  color: 'red',
});
