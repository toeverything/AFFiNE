import { keyframes, style } from '@vanilla-extract/css';

import { onboardingVars } from './style.css';

const fadeIn = keyframes({
  from: { opacity: 0, pointerEvents: 'none' },
  to: { opacity: 1, pointerEvents: 'auto' },
});

export const tooltip = style({
  width: 500,
  textAlign: 'center',
  fontFamily: 'var(--affine-font-family)',
  fontSize: '20px',
  lineHeight: '28px',
  fontWeight: 600,
  opacity: 0,
  animation: `${fadeIn} 1s ease forwards`,
  animationDelay: onboardingVars.animateIn.tooltipShowUpDelay,
  color: '#121212',
  selectors: {
    '[data-is-desktop="true"] &': {
      color: 'white',
      textShadow: '0px 0px 4px rgba(66, 65, 73, 0.14)',
    },
  },
});

export const next = style({
  position: 'absolute',
  top: 0,
  right: 0,
  opacity: 0,
  animation: `${fadeIn} 1s ease forwards`,
  animationDelay: onboardingVars.animateIn.nextButtonShowUpDelay,
});
