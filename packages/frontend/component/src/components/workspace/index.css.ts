import { lightCssVariables } from '@toeverything/theme';
import type { ComplexStyleRule } from '@vanilla-extract/css';
import { globalStyle, style } from '@vanilla-extract/css';

import { breakpoints } from '../../styles/mui-theme';

export const appStyle = style({
  width: '100%',
  position: 'relative',
  height: '100vh',
  display: 'flex',
  flexGrow: '1',
  flexDirection: 'row',
  backgroundColor: 'var(--affine-background-primary-color)',
  selectors: {
    '&[data-is-resizing="true"]': {
      cursor: 'col-resize',
    },
    '&.blur-background': {
      backgroundColor: 'transparent',
    },
    '&.noisy-background::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      opacity: 'var(--affine-noise-opacity, 0)',
      backgroundRepeat: 'repeat',
      backgroundSize: '2.5%',
      // todo: figure out how to use vanilla-extract webpack plugin to inject img url
      backgroundImage: `var(--noise-background)`,
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
  zIndex: 0, // it will create stacking context to limit layer of child elements and be lower than after auto zIndex
  width: 0,
  flex: 1,
  maxWidth: '100%',
  backgroundColor: 'var(--affine-background-primary-color)',
  selectors: {
    '&[data-show-padding="true"]': {
      margin: '8px',
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
    '&[data-in-trash-page="true"]': {
      marginBottom: '66px',
    },
    '&[data-in-trash-page="true"][data-show-padding="true"]': {
      marginBottom: '66px',
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

// Hack margin so that it works normally when sidebar is closed
globalStyle(
  `[data-testid=app-sidebar-wrapper][data-open=true][data-is-floating=false][data-has-background=false]
 ~ ${mainContainerStyle}[data-show-padding="true"]`,
  {
    // transition added here to prevent the transition from being applied on page load
    transition: 'margin-left .3s ease-in-out',
    marginLeft: '0',
  }
);

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
  selectors: {
    '&[data-in-trash-page="true"]': {
      bottom: '70px',
      '@media': {
        [breakpoints.down('md', true)]: {
          bottom: '80px',
        },
        [breakpoints.down('sm', true)]: {
          bottom: '85px',
        },
        print: {
          display: 'none',
        },
      },
    },
  },
});
