import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  fontSize: cssVar('fontBase'),
  position: 'relative',
  background: cssVar('backgroundPrimaryColor'),
});
export const affineLogo = style({
  color: 'inherit',
});
export const topNav = style({
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  position: 'fixed',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 120px',
  '@media': {
    'screen and (max-width: 1024px)': {
      padding: '16px 20px',
    },
  },
});
export const draggableHeader = style({
  height: '52px',
  width: '100%',
  position: 'fixed',
  ['WebkitAppRegion' as string]: 'drag',
});
export const topNavLinks = style({
  display: 'flex',
  columnGap: 4,
  '@media': {
    'screen and (max-width: 1024px)': {
      display: 'none',
    },
  },
});
export const topNavLink = style({
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  textDecoration: 'none',
  padding: '4px 18px',
});
export const iconButton = style({
  fontSize: '24px',
  pointerEvents: 'auto',
  selectors: {
    '&.plain': {
      color: cssVar('textPrimaryColor'),
    },
  },
});
export const hideInWideScreen = style({
  '@media': {
    'screen and (min-width: 1024px)': {
      display: 'none',
      position: 'absolute',
    },
  },
});
export const hideInSmallScreen = style({
  '@media': {
    'screen and (max-width: 1024px)': {
      display: 'none',
    },
  },
});
export const menu = style({
  width: '100vw',
  height: '100vh',
  padding: '0',
  background: cssVar('backgroundPrimaryColor'),
  borderRadius: '0',
  border: 'none',
  boxShadow: 'none',
});
export const menuItem = style({
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  textDecoration: 'none',
  padding: '12px 20px',
  maxWidth: '100%',
  position: 'relative',
  borderRadius: '0',
  transition: 'background 0.3s ease',
  selectors: {
    '&:after': {
      position: 'absolute',
      content: '""',
      bottom: 0,
      display: 'block',
      width: 'calc(100% - 40px)',
      height: '0.5px',
      background: cssVar('black10'),
    },
    '&:not(:last-of-type)': {
      marginBottom: '0',
    },
  },
});
