import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const workbenchRootContainer = style({
  display: 'flex',
  height: '100%',
  flex: 1,
});

export const workbenchViewContainer = style({
  flex: 1,
  overflow: 'hidden',
  height: '100%',
});

export const workbenchSidebar = style({
  display: 'flex',
  flexShrink: 0,
  height: '100%',
  right: 0,
  selectors: {
    [`&[data-client-border=true]`]: {
      paddingLeft: 8,
      borderRadius: 6,
    },
    [`&[data-client-border=false]`]: {
      borderLeft: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
    },
  },
});
