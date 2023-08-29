import { lightCssVariables } from '@toeverything/theme';
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
    '&.blur-background': {
      backgroundColor: 'var(--affine-background-primary-color)',
    },
    '&.noisy-background::before': {
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
    print: {
      vars: {
        '--affine-editor-width': '800px',
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

  '@media': {
    print: {
      vars: lightCssVariables,
    },
  },
});

export const mainContainerStyle = style({
  position: 'relative',
  width: 0,
  flex: 1,
  maxWidth: '100%',
  backgroundColor: 'var(--affine-background-primary-color)',
  selectors: {
    '&[data-show-padding="true"]': {
      margin: '8px 8px 8px 0',
      borderRadius: '5px',
      overflow: 'hidden',
      boxShadow: 'var(--affine-shadow-1)',
      '@media': {
        print: {
          overflow: 'visible',
          margin: '0px',
          borderRadius: '0px',
        },
      },
    },
    '&[data-show-padding="true"][data-is-macos="true"]': {
      borderRadius: '6px',
    },
    '&[data-show-padding="true"]:before': {
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

// These styles override the default styles of the react-resizable-panels
// as the default styles make the overflow part hidden when printing to PDF.
// See https://github.com/toeverything/AFFiNE/pull/3893
globalStyle(`${mainContainerStyle} > div[data-panel-group]`, {
  '@media': {
    print: {
      overflow: 'visible !important',
    },
  },
});

// These styles override the default styles of the react-resizable-panels
// as the default styles make the overflow part hidden when printing to PDF.
// See https://github.com/toeverything/AFFiNE/pull/3893
globalStyle(`${mainContainerStyle} > div[data-panel-group] > div[data-panel]`, {
  '@media': {
    print: {
      overflow: 'visible !important',
    },
  },
});

export const toolStyle = style({
  position: 'fixed',
  right: '30px',
  bottom: '30px',
  zIndex: 'var(--affine-z-index-popover)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
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
