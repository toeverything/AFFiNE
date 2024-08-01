import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const draggedOverHighlight = style({
  position: 'relative',
  selectors: {
    '&[data-dragged-over="true"]': {
      background: cssVar('--affine-hover-color'),
      borderRadius: '4px',
    },
  },
});
