import { style } from '@vanilla-extract/css';

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

export const mainContainerStyle = style({
  position: 'relative',
  flexGrow: 1,
  maxWidth: '100%',
  backgroundColor: 'var(--affine-background-primary-color)',
});

export const toolStyle = style({
  position: 'fixed',
  right: '30px',
  bottom: '30px',
  zIndex: 'var(--affine-z-index-popover)',
  '@media': {
    [breakpoints.down('md', true)]: {
      right: 'calc((100vw - 640px) * 3 / 19 + 5px)',
    },
    [breakpoints.down('sm', true)]: {
      right: '5px',
      bottom: '5px',
    },
  },
});
