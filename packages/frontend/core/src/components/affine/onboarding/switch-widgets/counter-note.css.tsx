import { keyframes, style } from '@vanilla-extract/css';

export const counterNote = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});
export const count = style({
  width: '50px',
  height: '50px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});
export const label = style({
  fontSize: '16px',
  fontFamily: '"Orelega One"',
  fontWeight: 700,
  lineHeight: '18px',
  width: 0,
  flexGrow: 1,
});

const drawCircleLine = keyframes({
  from: { strokeDashoffset: 120 },
  to: { strokeDashoffset: 0 },
});
export const circleAnim = style({
  strokeDashoffset: 120,
  selectors: {
    '[data-mode="edgeless"] &': {
      animation: `${drawCircleLine} 0.5s ease forwards`,
    },
  },
});

const numberIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});
export const fadeInAnim = style({
  opacity: 0,
  selectors: {
    '[data-mode="edgeless"] &': {
      animation: `${numberIn} 0.2s ease forwards`,
    },
  },
});
