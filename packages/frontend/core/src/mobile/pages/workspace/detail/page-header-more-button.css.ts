import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const iconButton = style({
  selectors: {
    '&[data-state=open]': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
  // Expand hit target to ~44pt for reliable taps on iPad.
  padding: '10px',
  minWidth: 44,
  minHeight: 44,
  touchAction: 'manipulation',
  position: 'relative',
  zIndex: 1,
});

export const outlinePanel = style({
  maxHeight: '60vh',
  overflow: 'auto',
});
