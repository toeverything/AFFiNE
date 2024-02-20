import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

import { onboardingVars } from '../style.css';
export const paperWidthVar = createVar();
export const paperHeightVar = createVar();
export const paper = style({
  vars: {
    [paperWidthVar]: onboardingVars.paper.w,
    [paperHeightVar]: onboardingVars.paper.h,
  },
  width: paperWidthVar,
  height: paperHeightVar,
  position: 'relative',
});
export const segment = style({
  width: '100%',
  height: '100%',
  background: onboardingVars.paper.bg,
  position: 'absolute',
  top: `calc(var(--segments-up) / var(--segments) * 100%)`,
  // add a thin line behind to hide the gap between segments
  '::before': {
    content: '""',
    position: 'absolute',
    transform: `translateZ(-1px)`,
    width: '100%',
    height: '2px',
    background: onboardingVars.paper.bg,
  },
  selectors: {
    ['&[data-root="true"]::before']: {
      content: 'none',
    },
    ['&[data-direction="up"]::before']: {
      bottom: -1,
    },
    ['&[data-direction="down"]::before']: {
      top: -1,
    },
    ['&[data-root="true"]']: {
      height: `calc(1 / var(--segments) * 100%)`,
    },
    ['&[data-direction="up"]']: {
      top: 'unset',
      bottom: `100%`,
      transformOrigin: 'bottom',
    },
    ['&[data-direction="down"]']: {
      top: `100%`,
      transformOrigin: 'top',
    },
    ['&[data-top="true"]']: {
      borderTopLeftRadius: onboardingVars.paper.r,
      borderTopRightRadius: onboardingVars.paper.r,
    },
    ['&[data-bottom="true"]']: {
      borderBottomLeftRadius: onboardingVars.paper.r,
      borderBottomRightRadius: onboardingVars.paper.r,
    },
  },
});
export const contentWrapper = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  position: 'absolute',
});
export const content = style({
  padding: '16px',
  overflow: 'hidden',
  fontFamily: cssVar('fontFamily'),
  selectors: {
    [`${contentWrapper} > &`]: {
      position: 'absolute',
      width: paperWidthVar,
      height: paperHeightVar,
      top: `calc((var(--index)) * -100%)`,
    },
  },
});
export const articleWrapper = style({
  width: '100%',
  height: '100%',
  overflow: 'hidden',
});
export const article = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  color: onboardingVars.paper.textColor,
});
export const title = style({
  fontSize: '18px',
  fontWeight: 600,
  lineHeight: '26px',
});
export const text = style({
  fontSize: '14px',
  fontWeight: 400,
  lineHeight: '22px',
});
