import { keyframes, style } from '@vanilla-extract/css';

export const layout = style({
  margin: '80px auto',
  maxWidth: '536px',
});

export const upgradeBox = style({
  padding: '48px 52px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

export const upgradeTips = style({
  margin: '20px 0',
  color: 'var(--affine-text-secondary-color)',
  fontSize: '12px',
  fontStyle: 'normal',
  fontWeight: '400',
  lineHeight: '20px',
});

const rotate = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '50%': { transform: 'rotate(180deg)' },
  '100%': { transform: 'rotate(360deg)' },
});

export const loadingIcon = style({
  animation: `${rotate} 1.2s infinite linear`,
});
