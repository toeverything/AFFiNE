import { style } from '@vanilla-extract/css';

export const highlightContainer = style({
  display: 'flex',
});

export const highlightText = style({
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});

export const highlightKeyword = style({
  color: 'var(--affine-primary-color)',
  whiteSpace: 'pre',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  flexShrink: 0,
});

export const labelTitle = style({
  fontSize: 'var(--affine-font-base)',
  lineHeight: '24px',
  fontWeight: 400,
  textAlign: 'justify',
});

export const labelContent = style({
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  fontWeight: 400,
  textAlign: 'justify',
});

export const transContainer = style({
  display: 'flex',
  gap: '4px',
});
