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
  zIndex: 1,
});

export const imagePreviewModalImageStyle = style({
  background: 'transparent',
  height: '100%',
  width: '100%',
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

export const imagePreviewActionBarStyle = style({
  position: 'fixed',
  bottom: '28px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  padding: '16px 0',
  backgroundColor: 'var(--affine-white)',
  borderRadius: '8px',
  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
});

export const groupStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--affine-white)',
});

export const groupDividerStyle = style({
  color: 'black',
  borderRight: '24px solid transparent',
});

export const buttonStyle = style({
  paddingLeft: '10px',
  paddingRight: '10px',
});

export const scaleIndicatorStyle = style({
  margin: '0 8px',
});

export const deleteButtonStyle = style({
  color: 'red',
});

export const imagePreviewControlStyle = style({
  position: 'absolute',
  width: '100%',
  height: '100%',
  zIndex: baseTheme.zIndexModal + 1,
  display: 'flex',
  justifyContent: 'center',
});
