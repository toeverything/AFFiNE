import { style } from '@vanilla-extract/css';

import { navWidthVar } from '../index.css';

export const spacerStyle = style({
  position: 'absolute',
  width: '2px',
  left: navWidthVar,
  top: 0,
  bottom: 0,
  height: '100%',
  cursor: 'col-resize',
  '@media': {
    '(max-width: 600px)': {
      // do not allow resizing on mobile
      display: 'none',
    },
  },
  selectors: {
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
