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
});

export const urlButton = style({
  width: 'calc(100% - 64px - 15px)',
});
globalStyle(`${urlButton} span`, {
  width: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const fakeWrapper = style({
  position: 'relative',
  selectors: {
    '&::after': {
      content: '""',
      width: '100%',
      height: '100%',
      position: 'absolute',
      left: 0,
      top: 0,
      background: 'var(--affine-white-60)',
    },
  },
});
