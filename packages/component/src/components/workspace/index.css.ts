import { globalStyle, style } from '@vanilla-extract/css';

import { breakpoints } from '../../styles/mui-theme';
export const appStyle = style({
  width: '100%',
  position: 'relative',
  height: '100vh',
  transition: 'background-color .5s, opacity .5s',
  display: 'flex',
  flexGrow: '1',
  flexDirection: 'row',
  opacity: 1,
  selectors: {
    '&[data-is-resizing="true"]': {
      cursor: 'col-resize',
    },
    '&[data-is-hidden="true"]': {
      opacity: 0,
    },
  },
  vars: {
    '--affine-editor-width': '686px',
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
    },
  },
});

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
  },
});
