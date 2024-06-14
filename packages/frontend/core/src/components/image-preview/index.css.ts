import { baseTheme, cssVar } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';
const fadeInAnimation = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
const fadeOutAnimation = keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
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
  background: cssVar('white'),
  border: 'none',
  padding: '0.5rem',
  cursor: 'pointer',
  color: cssVar('iconColor'),
  transition: 'background 0.2s ease-in-out',
  zIndex: 1,
  marginTop: '38px',
  marginRight: '38px',
});
export const imagePreviewModalGoStyle = style({
  color: cssVar('white'),
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
  color: cssVar('white'),
  marginTop: '24px',
  '@media': {
    'screen and (max-width: 768px)': {
      textAlign: 'center',
    },
  },
});
export const imagePreviewActionBarStyle = style({
  height: '36px',
  maxWidth: 'max-content',
  padding: '0 6px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '4px',
  border: `0.5px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('white'),
  boxShadow: '0px 6px 16px 0px rgba(0, 0, 0, 0.14)',
  boxSizing: 'content-box',
  color: cssVar('iconColor'),
  userSelect: 'none',
});
export const cursorStyle = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '24px',
  minWidth: '34px',
  padding: '1px 2px',
  fontSize: '14px',
});
export const dividerStyle = style({
  width: '0.5px',
  height: '100%',
  background: cssVar('borderColor'),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const scaleIndicatorButtonStyle = style({
  height: '24px',
  padding: '1px 2px',
  minWidth: '50px',
  fontSize: '14px',
  color: `${cssVar('iconColor')} !important`,
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
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
  color: cssVar('white'),
  background: 'rgba(0,0,0,0.75)',
  padding: '10px',
  marginBottom: '21px',
});
export const suspenseFallbackStyle = style({
  opacity: 0,
  transition: 'opacity 2s ease-in-out',
});
