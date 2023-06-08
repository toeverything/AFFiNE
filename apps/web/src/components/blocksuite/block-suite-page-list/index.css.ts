import { style } from '@vanilla-extract/css';

export const pageListEmptyStyle = style({
  height: 'calc(100% - 52px)',
});

export const emptyDescButton = style({
  cursor: 'pointer',
  color: 'var(--affine-text-secondary-color)',
  background: 'var(--affine-background-code-block)',
  border: '1px solid var(--affine-border-color)',
  borderRadius: '4px',
  padding: '0 6px',
  boxSizing: 'border-box',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const emptyDescKbd = style([
  emptyDescButton,
  {
    cursor: 'text',
  },
]);
