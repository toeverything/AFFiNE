import { style } from '@vanilla-extract/css';

export const containerStyle = style({
  display: 'flex',
  width: '100%',
  padding: '0 16px',
  gap: '10px',
});
export const conversationStyle = style({
  padding: '10px 18px',
  border: '1px solid var(--affine-border-color)',
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '16px',
  borderRadius: '18px',
  maxWidth: 'calc(100% - 30px)',
});
export const avatarRightStyle = style({
  flexDirection: 'row-reverse',
});
export const aiMessageStyle = style({
  backgroundColor: 'rgba(207, 252, 255, 0.3)',
});

export const humanMessageStyle = style({
  backgroundColor: 'var(--affine-white-90)',
});
