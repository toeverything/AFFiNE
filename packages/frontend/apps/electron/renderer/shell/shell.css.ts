import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, style } from '@vanilla-extract/css';

export const sidebarOffsetVar = createVar();

export const root = style({
  width: '100vw',
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: cssVarV2('layer/background/primary'),
  selectors: {
    '&[data-translucent="true"]': {
      background: 'transparent',
    },
  },
});

export const appTabsHeader = style({
  zIndex: 1,
});

export const fallbackRoot = style({
  position: 'absolute',
  paddingTop: 52,
  width: '100%',
  height: '100%',
  zIndex: 0,
});

export const splitViewFallback = style({
  width: '100%',
  height: '100%',
  position: 'absolute',
  bottom: 0,
  right: 0,
  zIndex: 0,
  background: cssVarV2('layer/background/primary'),
});
