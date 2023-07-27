import { style } from '@vanilla-extract/css';

export const root = style({
  fontSize: 'var(--affine-font-xs)',
  minHeight: '16px',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  selectors: {
    '&:not(:first-of-type)': {
      marginTop: '10px',
    },
  },
});

export const label = style({
  color: 'var(--affine-black-30)',
});
