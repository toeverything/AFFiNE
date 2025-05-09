import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const imagePreviewModalStyle = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const imagePreviewTrap = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
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
  userSelect: 'none',
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
  zIndex: 2,
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
