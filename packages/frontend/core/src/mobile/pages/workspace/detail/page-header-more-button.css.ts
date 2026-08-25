import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const iconButton = style({
  selectors: {
    '&[data-state=open]': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
  // Expand hit target for reliable taps on iPad Pencil and finger input.
  padding: '10px',
  width: 72,
  minWidth: 72,
  height: 52,
  minHeight: 52,
  touchAction: 'manipulation',
  position: 'relative',
  zIndex: 1,
});

export const outlinePanel = style({
  maxHeight: '60vh',
  overflow: 'auto',
});
