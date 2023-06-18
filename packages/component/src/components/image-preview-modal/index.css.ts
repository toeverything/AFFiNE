import { baseTheme } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';

const fadeInAnimation = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fadeOutAnimation = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

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
  background: 'rgba(0, 0, 0, 0.75)',
});

export const loaded = style({
  opacity: 0,
  animationName: fadeInAnimation,
  animationDuration: '0.25s',
  animationFillMode: 'forwards',
});

export const unloaded = style({
  opacity: 1,
  animationName: fadeOutAnimation,
  animationDuration: '0.25s',
  animationFillMode: 'forwards',
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
  marginTop: '38px',
  marginRight: '38px',
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
  backgroundColor: 'var(--affine-white)',
  borderRadius: '8px',
  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
  maxWidth: 'max-content',
  minHeight: '44px',
});

export const groupStyle = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid #E3E2E4',
});

export const buttonStyle = style({
  paddingLeft: '10px',
  paddingRight: '10px',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});

export const scaleIndicatorButtonStyle = style({
  minHeight: '100%',
  minWidth: 'max-content',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
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

export const suspenseFallbackStyle = style({
  opacity: 0,
  transition: 'opacity 2s ease-in-out',
});
