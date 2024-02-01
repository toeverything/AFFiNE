import { cssVar } from '@toeverything/theme';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';

// in case that we need to support dark mode later
export const onboardingVars = {
  window: {
    bg: 'white',
    shadow: cssVar('shadow1'),
    transition: {
      size: '0.3s ease',
    },
  },
  paper: {
    w: '230px',
    h: '302px',
    r: '8px',
    bg: 'white',
    // textColor: 'var(--affine-light-text-primary-color)',
    textColor: '#121212',
    borderColor: '#E3E2E4',
  },
  unfolding: {
    sizeTransition: '0.3s ease',
    transformTransition: '0.3s ease',
  },
  web: {
    bg: '#F4F4F5',
    windowShadow:
      '1px 18px 39px 0px rgba(0, 0, 0, 0.15), 5px 71px 71px 0px rgba(0, 0, 0, 0.09), 12px 160px 96px 0px rgba(0, 0, 0, 0.05), 20px 284px 114px 0px rgba(0, 0, 0, 0.01), 32px 443px 124px 0px rgba(0, 0, 0, 0.00)',
  },
  article: {
    w: '1200px',
    h: '800px',
    r: '8px',
  },
  edgeless: {
    w: '1200px',
    h: '800px',
    r: '8px',
  },
  wellDone: {
    w: '800px',
    h: '600px',
    r: '12px',
  },
  canvas: {
    width: 3500,
    height: 3500,
    pageBlockWidth: 800,
    bgImage: 'radial-gradient(#e6e6e6 1px, #fff 1px)',
  },
  toolbar: {
    bg: 'white',
    borderColor: '#E3E2E4',
  },
  block: {
    transition: '0.5s ease',
  },
  animateIn: {
    tooltipShowUpDelay: '5s',
    nextButtonShowUpDelay: '20s',
  },
};
export const perspective = style({
  perspective: '10000px',
  transformStyle: 'preserve-3d',
});
export const fadeIn = keyframes({
  from: {
    opacity: 0,
  },
  to: {
    opacity: 1,
  },
});
export const onboarding = style([
  perspective,
  {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    selectors: {
      // hack background color for web
      '&::after': {
        content: '',
        position: 'absolute',
        inset: 0,
        background: onboardingVars.web.bg,
        transform: 'translateZ(-1000px) scale(2)',
        transition: 'opacity 0.3s ease',
      },
      '&[data-is-desktop="true"]::after': {
        animation: `${fadeIn} 0.8s linear`,
        // content: 'unset',
        background:
          'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 99.58%)',
      },
      '&[data-is-window="true"][data-is-desktop="true"]::after': {
        opacity: 0,
      },
    },
  },
]);
globalStyle(`${onboarding} *`, {
  perspective: '10000px',
  transformStyle: 'preserve-3d',
});
export const offsetOrigin = style({
  width: 0,
  height: 0,
  position: 'relative',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const paperLocation = style({
  position: 'absolute',
  left: `calc(var(--offset-x) - ${onboardingVars.paper.w} / 2)`,
  top: `calc(var(--offset-y) - ${onboardingVars.paper.h} / 2)`,
});
export const tipsWrapper = style({
  position: 'absolute',
  width: `calc(${onboardingVars.article.w} - 48px)`,
  maxWidth: 'calc(100vw - 96px)',
  bottom: 0,
  height: `calc(${onboardingVars.article.h} / 2 - 24px)`,
  maxHeight: 'calc(50vh - 48px)',
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  opacity: 0,
  transition: '0.3s ease',
  selectors: {
    '&[data-visible="true"]': {
      opacity: 1,
    },
  },
});
globalStyle(`${tipsWrapper} > *`, {
  display: 'inline-block',
  height: 'fit-content',
});
globalStyle(`${tipsWrapper}[data-visible="true"] > *`, {
  pointerEvents: 'auto',
});
