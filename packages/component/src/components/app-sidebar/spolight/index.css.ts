import { createVar, style } from '@vanilla-extract/css';

export const spotlightX = createVar();
export const spotlightY = createVar();
export const spotlightOpacity = createVar();
export const spotlightSize = createVar();

export const spotlight = style({
  vars: {
    [spotlightX]: '0px',
    [spotlightY]: '0px',
    [spotlightOpacity]: '0',
    [spotlightSize]: '64px',
  },
  position: 'absolute',
  background: `radial-gradient(${spotlightSize} circle at ${spotlightX} ${spotlightY}, var(--affine-text-primary-color), transparent)`,
  inset: '0px',
  pointerEvents: 'none',
  willChange: 'background, opacity',
  opacity: spotlightOpacity,
  zIndex: 1,
  transition: 'all 0.2s',
  borderRadius: 'inherit',
});
