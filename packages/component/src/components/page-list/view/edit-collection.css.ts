import { style } from '@vanilla-extract/css';

export const previewCountTipsHighlight = style({
  color: 'var(--affine-primary-color)',
});

export const previewCountTips = style({
  fontSize: 12,
  lineHeight: '20px',
  color: 'var(--affine-text-secondary-color)',
});

export const rulesTitleHighlight = style({
  color: 'var(--affine-primary-color)',
  fontStyle: 'italic',
  fontWeight: 800,
});

export const tabButton = style({ height: 28 });
export const icon = style({
  color: 'var(--affine-icon-color)',
});
export const button = style({
  userSelect: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const bottomButton = style({
  padding: '4px 12px',
  borderRadius: 8,
});

export const previewActive = style({
  backgroundColor: 'var(--affine-hover-color-filled)',
});
export const rulesTitle = style({
  padding: '20px 24px',
  userSelect: 'none',
  fontSize: 20,
  lineHeight: '24px',
  color: 'var(--affine-text-secondary-color)',
  borderBottom: '1px solid var(--affine-border-color)',
});
