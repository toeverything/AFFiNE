import { globalStyle, style } from '@vanilla-extract/css';

export const profileWrapper = style({
  display: 'flex',
  alignItems: 'flex-end',
  marginTop: '12px',
});
export const profileHandlerWrapper = style({
  flexGrow: '1',
  display: 'flex',
  alignItems: 'center',
  marginLeft: '20px',
});

export const avatarWrapper = style({
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'relative',
  overflow: 'hidden',
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
  width: '100%',
  height: '100%',
  position: 'absolute',
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  zIndex: '1',
  color: 'var(--affine-white)',
  fontSize: 'var(--affine-font-h-4)',
});

export const fakeWrapper = style({
  position: 'relative',
  opacity: 0.4,
  marginTop: '24px',
  selectors: {
    '&::after': {
      content: '""',
      width: '100%',
      height: '100%',
      position: 'absolute',
      left: 0,
      top: 0,
      cursor: 'not-allowed',
    },
  },
});

export const membersList = style({
  marginTop: '24px',
  padding: '12px 6px',
  borderRadius: '12px',
  background: 'var(--affine-background-primary-color)',
  gap: '2px',
});

export const listItem = style({
  padding: '0 16px',
  height: '40px',
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  gap: '12px',
  ':hover': {
    background: 'var(--affine-hover-color)',
    borderRadius: '8px',
  },
});
export const memberContainer = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
});
export const permissionContainer = style({
  width: '100%',
  textAlign: 'center',
});
export const memberName = style({
  width: '100%',
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-primary-color)',
});
export const memberEmail = style({
  width: '100%',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
});
export const iconButton = style({
  opacity: 0,
  pointerEvents: 'none',
});
export const displayNone = style({
  opacity: 0,
  pointerEvents: 'none',
});
globalStyle(`${listItem}:hover ${iconButton}`, {
  opacity: 1,
  pointerEvents: 'all',
});
