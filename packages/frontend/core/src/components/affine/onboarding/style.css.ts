import { globalStyle, style } from '@vanilla-extract/css';

// in case that we need to support dark mode later
export const onboardingVars = {
  window: {
    bg: 'var(--affine-pure-white)',
    shadow: 'var(--affine-shadow-1)',
    transition: {
      size: '0.3s ease',
    },
  },
  paper: {
    w: '230px',
    h: '302px',
    r: '8px',
    bg: 'var(--affine-pure-white)',
    // textColor: 'var(--affine-light-text-primary-color)',
    textColor: '#121212',
    borderColor: '#E3E2E4',
  },
  unfolding: {
    sizeTransition: '0.3s ease',
    transformTransition: '0.3s ease',
  },
  web: {
    bg: '#fafafa', // TODO: use var
  },

  article: {
    w: '1200px',
    h: '800px',
  },
  edgeless: {
    w: '1200px',
    h: '800px',
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
