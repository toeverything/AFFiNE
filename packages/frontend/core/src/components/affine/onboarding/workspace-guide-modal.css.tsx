import { style } from '@vanilla-extract/css';

export const title = style({
  padding: '20px 24px 8px 24px',
  fontSize: '18px',
  fontFamily: 'var(--affine-font-family)',
  fontWeight: '600',
  lineHeight: '26px',
});

export const content = style({
  padding: '0px 24px',
  fontSize: '15px',
  lineHeight: '24px',
  fontWeight: 400,
});

export const footer = style({
  padding: '20px 28px',
  display: 'flex',
  justifyContent: 'flex-end',
});

export const gotItBtn = style({
  fontWeight: 500,
});
