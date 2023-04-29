import { style } from '@vanilla-extract/css';

import { navWidthVar } from '../index.css';

export const spacerStyle = style({
  position: 'absolute',
  left: navWidthVar,
  top: 0,
  bottom: 0,
  width: '7px',
  height: '100%',
  borderLeft: '1px solid var(--affine-border-color)',
  zIndex: 'calc(var(--affine-z-index-modal) - 1)',
  backgroundColor: 'transparent',
  opacity: 0,
  cursor: 'col-resize',
  '@media': {
    '(max-width: 600px)': {
      // do not allow resizing on mobile
      display: 'none',
    },
  },
  transition: 'opacity 0.15s ease 0.1s',
  selectors: {
    '&:hover': {
      opacity: 1,
    },
    '&[data-resizing="true"]': {
      transition: 'width .3s, min-width .3s, max-width .3s',
    },
    '&[data-open="false"]': {
      display: 'none',
    },
    '&[data-open="open"]': {
      display: 'block',
    },
  },
});
