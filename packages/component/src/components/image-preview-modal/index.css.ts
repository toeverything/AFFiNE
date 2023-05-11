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

export const imagePreviewModalContainerStyle = style({
  position: 'absolute',
  top: '20%',
});

export const imagePreviewModalImageStyle = style({
  background: 'transparent',
  maxWidth: '686px',
  objectFit: 'contain',
  objectPosition: 'center',
  borderRadius: '4px',
});

export const imagePreviewModalActionsStyle = style({
  position: 'absolute',
  bottom: '28px',
  background: 'var(--affine-white)',
});
