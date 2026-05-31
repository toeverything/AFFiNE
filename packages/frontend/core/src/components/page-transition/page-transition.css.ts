import { globalStyle, keyframes } from '@vanilla-extract/css';

/**
 * Outgoing page: starts flat, lifts off the spine, falls away to the left.
 * Mid-flip we add a drop-shadow that simulates paper catching light, plus a
 * small translateZ to give the page a sense of weight before it tilts past
 * 90deg. Brightness dips to mimic the paper rolling away from the light.
 */
const flipOut = keyframes({
  '0%': {
    transform:
      'perspective(2200px) translateZ(0px) translateX(0%) rotateY(0deg)',
    filter:
      'brightness(1) contrast(1) drop-shadow(0 0 0 rgba(0, 0, 0, 0))',
  },
  '35%': {
    filter:
      'brightness(0.88) contrast(1.03) drop-shadow(14px 18px 24px rgba(0, 0, 0, 0.22))',
  },
  '50%': {
    transform:
      'perspective(2200px) translateZ(40px) translateX(1.5%) rotateY(-90deg)',
    filter:
      'brightness(0.78) contrast(1.05) drop-shadow(22px 24px 32px rgba(0, 0, 0, 0.28))',
  },
  '65%': {
    filter:
      'brightness(0.7) contrast(1.03) drop-shadow(12px 16px 22px rgba(0, 0, 0, 0.2))',
  },
  '100%': {
    transform:
      'perspective(2200px) translateZ(0px) translateX(0%) rotateY(-180deg)',
    filter:
      'brightness(0.62) contrast(1) drop-shadow(0 0 0 rgba(0, 0, 0, 0))',
  },
});

/**
 * Incoming page: mirror of flipOut. Comes in from rotateY(180deg), rises off
 * the spine at the midpoint, then settles flat.
 */
const flipIn = keyframes({
  '0%': {
    transform:
      'perspective(2200px) translateZ(0px) translateX(0%) rotateY(180deg)',
    filter:
      'brightness(0.62) contrast(1) drop-shadow(0 0 0 rgba(0, 0, 0, 0))',
  },
  '35%': {
    filter:
      'brightness(0.7) contrast(1.03) drop-shadow(12px 16px 22px rgba(0, 0, 0, 0.2))',
  },
  '50%': {
    transform:
      'perspective(2200px) translateZ(40px) translateX(1.5%) rotateY(90deg)',
    filter:
      'brightness(0.82) contrast(1.05) drop-shadow(22px 24px 32px rgba(0, 0, 0, 0.28))',
  },
  '65%': {
    filter:
      'brightness(0.92) contrast(1.02) drop-shadow(14px 18px 24px rgba(0, 0, 0, 0.18))',
  },
  '100%': {
    transform:
      'perspective(2200px) translateZ(0px) translateX(0%) rotateY(0deg)',
    filter:
      'brightness(1) contrast(1) drop-shadow(0 0 0 rgba(0, 0, 0, 0))',
  },
});

const DURATION = '560ms';
const EASE_OUT = 'cubic-bezier(0.55, 0.08, 0.68, 0.53)';
const EASE_IN = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';

/**
 * Root pair = sidebar + chrome (everything outside the page-content region).
 * Kill its animation so the sidebar stays perfectly still during navigation;
 * since the sidebar doesn't change between snapshots this is invisible.
 */
globalStyle('::view-transition-group(root)', {
  animation: 'none',
});

globalStyle('::view-transition-old(root)', {
  animation: 'none',
  // Skip the old root snapshot entirely so we render the new sidebar state
  // immediately. The sidebar is identical between snapshots, so no visual jump.
  display: 'none',
});

globalStyle('::view-transition-new(root)', {
  animation: 'none',
  opacity: 1,
});

/**
 * page-content pair = the workbench RouteContainer (header + Outlet). This
 * is what we actually flip. See route-container.css.ts for the name binding.
 */
globalStyle('::view-transition-group(page-content)', {
  animationDuration: DURATION,
});

globalStyle('::view-transition-image-pair(page-content)', {
  perspective: '2200px',
  perspectiveOrigin: 'center center',
  isolation: 'isolate',
});

globalStyle('::view-transition-old(page-content)', {
  animation: `${flipOut} ${DURATION} ${EASE_OUT} both`,
  transformOrigin: 'left center',
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
  willChange: 'transform, filter',
  mixBlendMode: 'normal',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
});

globalStyle('::view-transition-new(page-content)', {
  animation: `${flipIn} ${DURATION} ${EASE_IN} both`,
  transformOrigin: 'left center',
  transformStyle: 'preserve-3d',
  backfaceVisibility: 'hidden',
  willChange: 'transform, filter',
  mixBlendMode: 'normal',
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animation: 'none',
    },
  },
});
