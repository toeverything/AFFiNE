import { globalStyle, style } from '@vanilla-extract/css';

// in case that we need to support dark mode later
export const onboardingVars = {
  window: {
    bg: 'white',
    shadow: 'var(--affine-shadow-1)',
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
    bg: '#fafafa',
  },

  article: {
    w: '1200px',
    h: '800px',
  },
  edgeless: {
    w: '1200px',
    h: '800px',
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
      },
      '&[data-is-desktop="true"]::after': {
        content: 'unset',
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
  top: `calc(-${onboardingVars.article.h} / 2 + 24px)`,
  pointerEvents: 'none',
  display: 'flex',
  justifyContent: 'center',
  opacity: 0,
  transition: '0.3s ease 1s',
  selectors: {
    '&[data-visible="true"]': {
      pointerEvents: 'auto',
      opacity: 1,
    },
  },
});
