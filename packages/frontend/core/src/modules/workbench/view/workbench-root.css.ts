import { style } from '@vanilla-extract/css';

export const workbenchRootContainer = style({
  display: 'flex',
  height: '100%',
  flex: 1,
  overflow: 'hidden',
  selectors: {
    [`&[data-client-border="true"]`]: {
      gap: '8px',
    },
  },
});

export const workbenchViewContainer = style({
  flex: 1,
  overflow: 'hidden',
  height: '100%',
});
