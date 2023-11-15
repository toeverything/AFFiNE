import { style } from '@vanilla-extract/css';

export const iconWrapper = style({
  position: 'absolute',
  top: '16px',
  left: '16px',
  fontSize: '24px',
  cursor: 'pointer',
  color: 'var(--affine-text-primary-color)',
  selectors: {
    '&:visited': {
      color: 'var(--affine-text-primary-color)',
    },
  },
});
