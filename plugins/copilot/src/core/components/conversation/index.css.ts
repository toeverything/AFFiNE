import { style } from '@vanilla-extract/css';

export const conversationStyle = style({
  padding: '10px 18px',
  border: '1px solid var(--affine-border-color)',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '16px',
});

export const aiMessageStyle = style({
  backgroundColor: 'rgba(207, 252, 255, 0.3)',
  borderRadius: '18px 18px 18px 2px',
});

export const humanMessageStyle = style({
  borderRadius: '18px 18px 2px 18px',
  backgroundColor: 'var(--affine-white-90)',
});
