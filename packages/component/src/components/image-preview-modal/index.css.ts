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
  background: 'rgba(0, 0, 0, 0.5)',
});

export const imagePreviewModalCloseButtonStyle = style({
  position: 'absolute',
  top: '0.5rem',
  right: '0.5rem',
  background: 'var(--affine-white)',
  border: 'none',
  padding: '0.5rem',
  cursor: 'pointer',
  color: 'var(--affine-black)',
  fontSize: '1.5rem',
  borderRadius: '4px',
  transition: 'background 0.2s ease-in-out',
});

export const imagePreviewModalImageStyle = style({
  background: 'transparent',
  width: '50%',
  height: '50%',
  objectFit: 'contain',
  objectPosition: 'center',
  borderRadius: '4px',
});
