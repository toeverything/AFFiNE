import { globalStyle } from '@vanilla-extract/css';

globalStyle('*', {
  margin: 0,
  padding: 0,
});

globalStyle('body', {
  color: 'var(--affine-text-primary-color)',
  fontFamily: 'var(--affine-font-family)',
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-font-height)',
  backgroundColor: 'var(--affine-background-primary-color)',
});

globalStyle('.docs-story', {
  backgroundColor: 'var(--affine-background-primary-color)',
});

globalStyle('body.sb-main-fullscreen', {
  overflowY: 'auto',
});
