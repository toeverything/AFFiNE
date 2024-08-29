import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const iconButton = style({
  selectors: {
    '&[data-state=open]': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
  padding: '10px',
});

export const outlinePanel = style({
  maxHeight: '60vh',
  overflow: 'auto',
});
