import { style } from '@vanilla-extract/css';

export const root = style({
  fontSize: 'var(--affine-font-xs)',
  minHeight: '16px',
  width: 'calc(100% + 6px)',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '4px',
  padding: '0 8px',
  selectors: {
    '&:not(:first-of-type)': {
      marginTop: '16px',
    },
  },
});

export const label = style({
  color: 'var(--affine-black-30)',
});
