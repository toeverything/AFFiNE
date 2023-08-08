import { globalStyle, style } from '@vanilla-extract/css';

export const moveToTrashStyle = style({
  padding: '4px 12px',
  ':hover': {
    backgroundColor: 'var(--affine-background-error-color)',
    color: 'var(--affine-error-color)',
  },
});

globalStyle(`${moveToTrashStyle}:hover svg`, {
  color: 'var(--affine-error-color)',
});
