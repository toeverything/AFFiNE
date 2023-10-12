import { style } from '@vanilla-extract/css';

export const notFoundPageContainer = style({
  fontSize: 'var(--affine-font-base)',
  color: 'var(--affine-text-primary-color)',
  height: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100vw',
});

export const wrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '24px auto 0',
});
export const largeButtonEffect = style({
  boxShadow: 'var(--affine-large-button-effect) !important',
});
