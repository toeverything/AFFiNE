import { style } from '@vanilla-extract/css';

export const iconWrapper = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: '24px',
  cursor: 'pointer',
  color: 'var(--affine-text-primary-color)',
  selectors: {
    '&:visited': {
      color: 'var(--affine-text-primary-color)',
    },
  },
});
export const rightItemContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '0 8px',
});

export const presentButton = style({
  gap: '4px',
});
