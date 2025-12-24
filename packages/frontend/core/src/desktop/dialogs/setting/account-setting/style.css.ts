import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const profileInputWrapper = style({
  marginLeft: '20px',
});
globalStyle(`${profileInputWrapper} label`, {
  display: 'block',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
});
export const avatarWrapper = style({
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'relative',
  cursor: 'pointer',
  flexShrink: '0',
  selectors: {
    '&.disable': {
      cursor: 'default',
      pointerEvents: 'none',
    },
  },
});
globalStyle(`${avatarWrapper}:hover .camera-icon-wrapper`, {
  display: 'flex',
});
globalStyle(`${avatarWrapper} .camera-icon-wrapper`, {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'absolute',
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  zIndex: '1',
  color: cssVar('white'),
  fontSize: cssVar('fontH4'),
});

export const successDeleteAccountContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '12px',
});
export const confirmContent = style({
  paddingLeft: '0',
  paddingRight: '0',
});
export const inputWrapper = style({
  marginTop: '12px',
});
