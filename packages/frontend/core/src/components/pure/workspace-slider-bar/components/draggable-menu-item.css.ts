import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const draggableMenuItem = style({
  selectors: {
    '&[data-draggable=true]:before': {
      content: '""',
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      left: 0,
      width: 4,
      height: 4,
      transition: 'height 0.2s, opacity 0.2s',
      backgroundColor: cssVar('placeholderColor'),
      borderRadius: '2px',
      opacity: 0,
      willChange: 'height, opacity',
    },
    '&[data-draggable=true]:hover:before': {
      height: 12,
      opacity: 1,
    },
    '&[data-draggable=true][data-dragging=true]': {
      backgroundColor: cssVar('hoverColor'),
    },
    '&[data-draggable=true][data-dragging=true]:before': {
      height: 32,
      width: 2,
      opacity: 1,
    },
  },
});
