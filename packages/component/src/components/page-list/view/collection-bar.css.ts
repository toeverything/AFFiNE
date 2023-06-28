import { style } from '@vanilla-extract/css';

export const pin = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  cursor: 'pointer',
  borderRadius: 4,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const pinedIcon = style({
  display: 'block',
  selectors: {
    [`${pin}:hover &`]: {
      display: 'none',
    },
  },
});
export const pinIcon = style({
  display: 'none',
  selectors: {
    [`${pin}:hover &`]: {
      display: 'block',
    },
  },
});
export const view = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  height: '100%',
  paddingLeft: 16,
});
