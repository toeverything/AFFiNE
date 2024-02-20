import { cssVar } from '@toeverything/theme';
import { keyframes, style } from '@vanilla-extract/css';

import { onboardingVars, paperLocation } from '../style.css';
const unfolding = onboardingVars.unfolding;
const shadowIn = keyframes({
  from: {
    boxShadow: `0px 0px 0px rgba(0, 0, 0, 0)`,
  },
  to: {
    boxShadow: `0px 0px 4px rgba(66, 65, 73, 0.14)`,
  },
});
const borderIn = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
const fadeOut = keyframes({
  from: {
    opacity: 1,
  },
  to: {
    opacity: 0,
  },
});
export const unfoldingWrapper = style([
  paperLocation,
  {
    vars: {
      '--hover-offset-y': '0px',
      '--hover-scale': '1',
    },
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform:
      'rotate(var(--toRotateZ)) translateY(var(--hover-offset-y)) scale(var(--hover-scale))',
    cursor: 'pointer',
    backgroundColor: onboardingVars.paper.bg,
    borderRadius: onboardingVars.paper.r,
    width: onboardingVars.paper.w,
    height: onboardingVars.paper.h,
    // animate in
    boxShadow: `0px 0px 0px rgba(0, 0, 0, 0)`,
    animation: `${shadowIn} 0.5s ease forwards`,
    transition: `all 0.23s ease, width ${unfolding.sizeTransition}, height ${unfolding.sizeTransition}, transform ${unfolding.transformTransition}`,
    ':hover': {
      vars: {
        '--hover-offset-y': '-10px',
        '--hover-scale': '1.03',
      },
    },
    '::before': {
      // hack border
      content: '""',
      position: 'absolute',
      inset: 0,
      border: `1px solid ${onboardingVars.paper.borderColor}`,
      borderRadius: 'inherit',
      animation: `${borderIn} 0.5s ease forwards`,
      pointerEvents: 'none',
    },
    selectors: {
      '&[data-fold="false"]': {
        vars: {
          '--toRotateZ': '0deg',
          // reset hover to avoid flickering
          '--hover-offset-y': '0px',
          '--hover-scale': '1',
        },
        width: onboardingVars.article.w,
        height: onboardingVars.article.h,
        left: `calc(-${onboardingVars.article.w} / 2)`,
        top: `calc(-${onboardingVars.article.h} / 2)`,
      },
    },
  },
]);
export const unfoldingContent = style({
  width: onboardingVars.paper.w,
  height: onboardingVars.paper.h,
  padding: '16px',
  overflow: 'hidden',
  fontFamily: cssVar('fontFamily'),
  selectors: {
    '&.leave': {
      animation: `${fadeOut} 0.1s ease forwards`,
    },
  },
});
