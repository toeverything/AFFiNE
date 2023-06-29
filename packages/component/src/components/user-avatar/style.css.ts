import { style } from '@vanilla-extract/css';

export const avatarRoot = style({
  display: 'inline-flex',
  flexShrink: 0,
  alignItems: 'center',
  justifyContent: 'center',
  verticalAlign: 'middle',
  overflow: 'hidden',
  userSelect: 'none',
  borderRadius: '100%',
});

export const avatarImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  borderRadius: 'inherit',
});
export const avatarFallback = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--affine-primary-color)',
  color: 'var(--affine-white)',
  fontSize: 'var(--affine-font-base)',
  lineHeight: '1',
  fontWeight: '500',
});
