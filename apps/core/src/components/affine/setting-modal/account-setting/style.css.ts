import { globalStyle, style } from '@vanilla-extract/css';
export const profileInputWrapper = style({
  marginLeft: '20px',
});
globalStyle(`${profileInputWrapper} label`, {
  display: 'block',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  marginBottom: '4px',
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
