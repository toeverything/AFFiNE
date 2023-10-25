import { style } from '@vanilla-extract/css';

export const plansLayoutRoot = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});

export const scrollArea = style({
  marginLeft: 'calc(-1 * var(--setting-modal-gap-x))',
  paddingLeft: 'var(--setting-modal-gap-x)',
  paddingRight: 'calc(var(--setting-modal-gap-x) + 300px)',
  width: 'var(--setting-modal-width)',
  overflowX: 'auto',
});

export const allPlansLink = style({
  display: 'block',
  marginTop: '36px',
  color: 'var(--affine-primary-color)',
  background: 'transparent',
  borderColor: 'transparent',
  fontSize: 'var(--affine-font-xs)',
});
