import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
  width: '100%',
  position: 'relative',
  flexDirection: 'column',
  minWidth: 0,
  background: cssVar('backgroundPrimaryColor'),
  selectors: {
    [`&[data-client-border=true]`]: {
      borderRadius: '4px',
    },
  },
});

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  background: cssVar('backgroundPrimaryColor'),
  padding: '0 16px',
  selectors: {
    '&[data-sidebar-floating="false"]': {
      ['WebkitAppRegion' as string]: 'drag',
    },
    '&:has([data-popper-placement])': {
      ['WebkitAppRegion' as string]: 'no-drag',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
});

export const viewBodyContainer = style({
  display: 'flex',
  flex: 1,
  overflow: 'hidden',
});

export const leftSidebarButton = style({
  margin: '0 16px 0 0',
});

export const rightSidebarButton = style({
  margin: '0 0 0 16px',
});

export const viewHeaderContainer = style({
  display: 'flex',
  height: '100%',
  flexGrow: 1,
  minWidth: 12,
});
