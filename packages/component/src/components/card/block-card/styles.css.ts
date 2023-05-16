import { style } from '@vanilla-extract/css';

export const blockCard = style({
  display: 'flex',
  gap: '12px',
  padding: '8px 12px',
  color: 'var(--affine-text-primary-color)',
  backgroundColor: 'var(--affine-background-primary-color)',
  borderRadius: '4px',
  userSelect: 'none',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      boxShadow: 'var(--affine-shadow-1)',
    },
    // TODO active styles
  },
});

export const blockCardAround = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});

export const blockCardContent = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
});

export const blockCardDesc = style({
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
});
