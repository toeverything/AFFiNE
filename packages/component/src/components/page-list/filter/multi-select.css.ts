import { style } from '@vanilla-extract/css';

export const content = style({
  fontSize: 12,
  color: 'var(--affine-text-primary-color)',
  borderRadius: 8,
  padding: '3px 4px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const text = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 350,
});
export const optionList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '0 4px',
});
export const selectOption = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 14,
  height: 26,
  borderRadius: 5,
  maxWidth: 240,
  minWidth: 100,
  padding: '0 12px',
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const optionLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flex: 1,
});
export const done = style({
  display: 'flex',
  alignItems: 'center',
  color: 'var(--affine-primary-color)',
  marginLeft: 8,
});
