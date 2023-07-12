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

export const imagePreviewBackgroundStyle = style({
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  zIndex: baseTheme.zIndexModal,
  background: 'rgba(0, 0, 0, 0.75)',
});

export const imagePreviewModalStyle = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
  zIndex: 2,
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
  backgroundColor: 'var(--affine-white)',
  borderRadius: '8px',
  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3)',
  maxWidth: 'max-content',
  minHeight: '44px',
  maxHeight: '44px',
});

export const groupStyle = style({
  padding: '10px 0',
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderLeft: '1px solid #E3E2E4',
});

export const buttonStyle = style({
  minWidth: '24px',
  height: '24px',
  margin: '10px 6px',
  padding: '0 0',
  ':hover': {
    backgroundColor: 'var(--affine-background-error-color)',
    backgroundSize: '24px 24px',
  },
});

export const buttonIconStyle = style({
  width: '20px',
  height: '20px',
});

export const scaleIndicatorButtonStyle = style({
  minHeight: '100%',
  maxWidth: 'max-content',
  fontSize: '12px',
  padding: '5px 5px',

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
