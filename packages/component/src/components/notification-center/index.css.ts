import { style } from '@vanilla-extract/css';

export const notificationCenterViewportStyle = style({
  position: 'fixed',
  bottom: '18px',
  right: '20px',
  display: 'flex',
  flexDirection: 'column',
  width: '380px',
  margin: 0,
  zIndex: 2147483647,
  outline: 'none',
});

export const notificationStyle = style({
  position: 'relative',
  display: 'flex',
  backgroundColor: 'var(--affine-white)',
  border: '1px solid #E3E2E4',
  borderRadius: '8px',
});
