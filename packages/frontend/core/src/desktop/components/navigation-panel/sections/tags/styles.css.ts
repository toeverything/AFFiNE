import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const draggedOverHighlight = style({
  selectors: {
    '&[data-dragged-over="true"]': {
      background: cssVar('--affine-hover-color'),
      borderRadius: '4px',
    },
  },
});

export const iconContainer = style({
  display: 'flex',
  position: 'relative',
});

export const createModalAnchor = style({
  top: 20,
  left: 'auto',
  right: 0,
  transform: 'translateX(6px)',
});
