import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  background: 'var(--affine-white-30)',
  alignItems: 'center',
  borderRadius: '8px',
  border: '1px solid var(--affine-black-10)',
  fontSize: 'var(--affine-font-sm)',
  width: '100%',
  height: '52px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 24px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const particles = style({
  background: `var(--svg-animation), var(--svg-animation)`,
  backgroundRepeat: 'no-repeat, repeat',
  backgroundPosition: 'center, center top 100%',
  backgroundSize: '100%, 130%',
  WebkitMaskImage:
    'linear-gradient(to top, transparent, black, black, transparent)',
  width: '100%',
  height: '100%',
  position: 'absolute',
});

export const particlesBefore = style({
  content: '""',
  display: 'block',
  position: 'absolute',
  width: '100%',
  height: '100%',
  background: `var(--svg-animation), var(--svg-animation), var(--svg-animation)`,
  backgroundRepeat: 'no-repeat, repeat, repeat',
  backgroundPosition: 'center, center top 100%, center center',
  backgroundSize: '100% 120%, 150%, 120%',
  filter: 'blur(1px)',
  willChange: 'filter',
});

export const installLabel = style({
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  paddingLeft: '8px',
});

export const halo = style({
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  ':before': {
    content: '""',
    display: 'block',
    width: '60%',
    height: '40%',
    position: 'absolute',
    top: '80%',
    left: '50%',
    background:
      'linear-gradient(180deg, rgba(50, 26, 206, 0.1) 10%, rgba(50, 26, 206, 0.35) 30%, rgba(84, 56, 255, 1) 50%)',
    filter: 'blur(10px) saturate(1.2)',
    transform: 'translateX(-50%) translateY(calc(0 * 1%)) scale(0)',
    transition: '0.3s ease',
    willChange: 'filter',
  },
  selectors: {
    '&:hover:before': {
      transform: 'translateX(-50%) translateY(calc(-70 * 1%)) scale(1)',
    },
  },
});
