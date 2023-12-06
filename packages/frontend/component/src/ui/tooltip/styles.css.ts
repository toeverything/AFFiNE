import { style } from '@vanilla-extract/css';

export const tooltipContent = style({
  backgroundColor: 'var(--affine-tooltip)',
  color: 'var(--affine-white)',
  padding: '5px 12px',
  fontSize: 'var(--affine-font-sm)',
  lineHeight: '22px',
  borderRadius: '4px',
  maxWidth: '280px',
});
