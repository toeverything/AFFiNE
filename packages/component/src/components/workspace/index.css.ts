import type { ComplexStyleRule } from '@vanilla-extract/css';
import { globalStyle, style } from '@vanilla-extract/css';

import { breakpoints } from '../../styles/mui-theme';
export const appStyle = style({
  width: '100%',
  position: 'relative',
  height: '100vh',
  transition: 'background-color .5s',
  display: 'flex',
  flexGrow: '1',
  flexDirection: 'row',
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
    '--affine-editor-width': '800px',
  },
  '@media': {
    [breakpoints.down('sm', true)]: {
      vars: {
        '--affine-editor-width': '550px',
      },
    },
  },
});

globalStyle(`html[data-theme="light"] ${appStyle}`, {
  vars: {
    '--affine-noise-opacity': '0.25',
  },
});

globalStyle(`html[data-theme="dark"] ${appStyle}`, {
  vars: {
    '--affine-noise-opacity': '0.1',
  },
});

export const mainContainerStyle = style({
  position: 'relative',
  flexGrow: 1,
  maxWidth: '100%',
  zIndex: 0,
  backgroundColor: 'var(--affine-background-primary-color)',
  selectors: {
    '&[data-is-desktop="true"]': {
      margin: '8px 8px 8px 8px',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: 'var(--affine-shadow-1)',
      '@media': {
        print: {
          overflow: 'visible',
        },
      },
    },
    '&[data-is-desktop="true"]:before': {
      content: '""',
      position: 'absolute',
      height: '8px',
      width: '100%',
      top: '-8px',
      left: 0,
      WebkitAppRegion: 'drag',
    },
  },
} as ComplexStyleRule);

export const toolStyle = style({
  position: 'fixed',
  right: '30px',
  bottom: '30px',
  zIndex: 'var(--affine-z-index-popover)',
  '@media': {
    [breakpoints.down('md', true)]: {
      right: 'calc((100vw - 640px) * 3 / 19 + 14px)',
    },
    [breakpoints.down('sm', true)]: {
      right: '5px',
      bottom: '5px',
    },
    print: {
      display: 'none',
    },
  },
});
