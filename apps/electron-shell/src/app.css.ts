import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  position: 'relative',
  height: '100vh',
  transition: 'background-color .5s',
  display: 'flex',
  selectors: {
    '&[data-is-resizing="true"]': {
      cursor: 'col-resize',
    },
    '&:before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      opacity: 'var(--affine-noise-opacity)',
      backgroundSize: '25%',
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 1024 1024' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.25' numOctaves='10' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
    },
  },
  vars: {
    '--affine-noise-opacity': '0.25',
  },
});

globalStyle(`html[data-theme="light"] ${root}`, {
  vars: {
    '--affine-noise-opacity': '0.25',
  },
});

globalStyle(`html[data-theme="dark"] ${root}`, {
  vars: {
    '--affine-noise-opacity': '0.1',
  },
});
