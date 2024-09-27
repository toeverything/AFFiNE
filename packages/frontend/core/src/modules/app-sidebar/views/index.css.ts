import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const floatingMaxWidth = 768;
export const navWrapperStyle = style({
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
  selectors: {
    '&[data-has-border=true]': {
      borderRight: `0.5px solid ${cssVar('borderColor')}`,
    },
    '&[data-is-floating="true"]': {
      backgroundColor: cssVar('backgroundPrimaryColor'),
    },
    '&[data-client-border="true"]': {
      paddingBottom: 8,
    },
  },
});
export const navHeaderButton = style({
  width: '32px',
  height: '32px',
  flexShrink: 0,
});
export const navHeaderNavigationButtons = style({
  display: 'flex',
  alignItems: 'center',
  columnGap: '32px',
});
export const navStyle = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
});
export const navHeaderStyle = style({
  flex: '0 0 auto',
  height: '52px',
  padding: '0px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const navBodyStyle = style({
  flex: '1 1 auto',
  height: 'calc(100% - 52px)',
  display: 'flex',
  flexDirection: 'column',
  rowGap: '4px',
});
export const sidebarFloatMaskStyle = style({
  transition: 'opacity .15s',
  opacity: 0,
  pointerEvents: 'none',
  position: 'fixed',
  top: 0,
  left: 0,
  right: '100%',
  bottom: 0,
  background: cssVar('backgroundModalColor'),
  selectors: {
    '&[data-open="true"][data-is-floating="true"]': {
      opacity: 1,
      pointerEvents: 'auto',
      right: '0',
      zIndex: 3,
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
});
