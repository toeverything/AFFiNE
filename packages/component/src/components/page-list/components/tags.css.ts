import { style } from '@vanilla-extract/css';

export const tagList = style({
  display: 'flex',
  flexWrap: 'nowrap',
  gap: 10,
  overflow: 'auto',
});

export const tag = style({
  flexShrink: 0,
  padding: '2px 10px',
  borderRadius: 6,
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 400,
  color: 'var(--affine-text-primary-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
