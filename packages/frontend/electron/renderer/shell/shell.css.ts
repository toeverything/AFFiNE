import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';

export const sidebarOffsetVar = createVar();

export const root = style({
  width: '100vw',
  height: '100vh',
  display: 'flex',
  background: cssVar('backgroundPrimaryColor'),
  selectors: {
    '&[data-translucent="true"]': {
      background: 'transparent',
    },
  },
});
