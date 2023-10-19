import { style } from '@vanilla-extract/css';

export const tagList = style({
  display: 'flex',
  flexWrap: 'nowrap',
  gap: 10,
  overflow: 'hidden',
});
export const tagListFull = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  maxWidth: 300,
  padding: 10,
  overflow: 'hidden',
});

export const tag = style({
  flexShrink: 0,
  padding: '2px 10px',
  borderRadius: 6,
  fontSize: 12,
  lineHeight: '16px',
  fontWeight: 400,
  maxWidth: '100%',
  color: 'var(--affine-text-primary-color)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
