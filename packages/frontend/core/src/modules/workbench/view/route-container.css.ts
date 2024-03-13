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
});

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  background: cssVar('backgroundPrimaryColor'),
  padding: '0 16px',
  ['WebkitAppRegion' as string]: 'drag',
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
  transition: 'all 0.2s ease-in-out',
  selectors: {
    '&[data-show=true]': {
      opacity: 1,
      width: 32,
      maxWidth: 32,
      marginLeft: 16,
    },
    '&[data-show=false]': {
      opacity: 0,
      maxWidth: 0,
      marginLeft: 0,
    },
  },
});

export const viewHeaderContainer = style({
  display: 'flex',
  height: '100%',
  flexGrow: 1,
  minWidth: 12,
});

export const windowsAppControlsContainer = style({
  display: 'flex',
  height: '100%',
  marginRight: '-16px',
  paddingLeft: '16px',
});
