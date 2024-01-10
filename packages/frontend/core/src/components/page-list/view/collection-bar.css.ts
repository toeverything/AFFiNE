import { style } from '@vanilla-extract/css';

export const view = style({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  fontSize: 14,
  fontWeight: 600,
  height: '100%',
});

export const option = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 4,
  cursor: 'pointer',
  borderRadius: 4,
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  opacity: 0,
  selectors: {
    [`${view}:hover &`]: {
      opacity: 1,
    },
  },
});
