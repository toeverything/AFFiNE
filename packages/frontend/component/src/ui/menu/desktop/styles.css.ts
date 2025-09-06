import { keyframes, style } from '@vanilla-extract/css';

const slideDown = keyframes({
  from: {
    opacity: 0,
    transform: 'translateY(-10px)',
    pointerEvents: 'none',
  },
  to: {
    opacity: 1,
    transform: 'translateY(0)',
    pointerEvents: 'none',
  },
});

const slideUp = keyframes({
  to: {
    opacity: 0,
    transform: 'translateY(-10px)',
  },
  from: {
    opacity: 1,
    transform: 'translateY(0)',
  },
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  justifyContent: 'space-between',
  borderRadius: 4,
  fontSize: 14,
  padding: '6px 12px',
  lineHeight: '20px',
  color: '#273035',
  cursor: 'pointer',
  selectors: {
    '&[data-block]': {
      padding: 0,
    },
    '&[data-disabled]': {
      color: '#B0B6BD',
      cursor: 'default',
    },
    '&[data-highlighted]': {
      background: '#E5E9EC',
    },
  },
});

export const icon = style({
  flexShrink: 0,
  width: 16,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const label = style({
  flex: 1,
});

export const shortcut = style({
  marginLeft: 'auto',
  color: '#7B828A',
  fontSize: 12,
});

export const contentAnimation = style({
  animation: `${slideDown} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
  selectors: {
    '&[data-state="closed"]': {
      pointerEvents: 'none',
      animation: `${slideUp} 150ms cubic-bezier(0.42, 0, 0.58, 1)`,
      animationFillMode: 'forwards',
    },
  },
});
