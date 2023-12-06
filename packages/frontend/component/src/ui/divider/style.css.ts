import { style } from '@vanilla-extract/css';

export const divider = style({
  height: '1px',
  backgroundColor: 'var(--affine-border-color)',
  borderRadius: '8px',
  margin: '8px 0',
  width: '100%',
});
export const thinner = style({
  height: '0.5px',
});
export const verticalDivider = style({
  width: '1px',
  borderRadius: '8px',
  height: '100%',
  margin: '0 2px',
});
export const verticalThinner = style({
  width: '0.5px',
});
