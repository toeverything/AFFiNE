import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '8px',
  width: '100%',
  minHeight: '36px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const icon = style({
  marginRight: '14px',
  color: 'var(--affine-icon-color)',
});

export const spacer = style({
  flex: 1,
});

export const linkItemRoot = style({
  color: 'inherit',
  display: 'contents',
});
