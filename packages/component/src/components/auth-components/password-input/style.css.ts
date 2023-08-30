import { style } from '@vanilla-extract/css';

export const tag = style({
  padding: '0 15px',
  height: 20,
  lineHeight: '20px',
  borderRadius: 10,
  fontSize: 'var(--affine-font-xs)',

  selectors: {
    '&.weak': {
      backgroundColor: 'var(--affine-tag-red)',
      color: 'var(--affine-error-color)',
    },
    '&.medium': {
      backgroundColor: 'var(--affine-tag-orange)',
      color: 'var(--affine-warning-color)',
    },
    '&.strong': {
      backgroundColor: 'var(--affine-tag-green)',
      color: 'var(--affine-success-color)',
    },
    '&.maximum': {
      backgroundColor: 'var(--affine-tag-red)',
      color: 'var(--affine-error-color)',
    },
  },
});
