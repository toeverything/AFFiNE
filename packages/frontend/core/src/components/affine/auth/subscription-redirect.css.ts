import { style } from '@vanilla-extract/css';

export const loadingContainer = style({
  display: 'flex',
  width: '100vw',
  height: '60vh',
  justifyContent: 'center',
  alignItems: 'center',
});

export const subscriptionLayout = style({
  margin: '10% auto',
  maxWidth: '536px',
});

export const subscriptionBox = style({
  padding: '48px 52px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

export const subscriptionTips = style({
  margin: '20px 0',
  color: 'var(--affine-text-secondary-color)',
  fontSize: '12px',
  fontStyle: 'normal',
  fontWeight: '400',
  lineHeight: '20px',
});
