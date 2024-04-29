import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const dialog = style({
  maxWidth: 400,
  width: 'calc(100% - 32px)',
  padding: 0,
  boxShadow: 'none',
  '::after': {
    content: '""',
    position: 'absolute',
    borderRadius: 'inherit',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    boxShadow: cssVar('menuShadow'),
    pointerEvents: 'none',
  },
});
export const dialogContent = style({
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
});

export const videoHeader = style({
  borderRadius: 'inherit',
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  width: '100%',
  height: 225,
  overflow: 'hidden',
});
export const videoWrapper = style({
  width: '100%',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
});
export const video = style({
  position: 'absolute',
  left: -2,
  top: -2,
  width: 'calc(100% + 4px)',
  height: 'calc(100% + 4px)',
});

export const mainContent = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '20px 24px 0px 24px',
});
export const title = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
  lineHeight: '26px',
  color: cssVar('textPrimaryColor'),
});
export const description = style({
  fontSize: cssVar('fontBase'),
  lineHeight: '24px',
  minHeight: 48,
  fontWeight: 400,
  color: cssVar('textPrimaryColor'),
});
export const link = style({
  color: cssVar('textEmphasisColor'),
  textDecoration: 'underline',
});
export const privacy = style({
  padding: '20px 24px 0px 24px',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
  lineHeight: '20px',
  height: 44,
  transition: 'all 0.3s',
  overflow: 'hidden',

  selectors: {
    '&[aria-hidden="true"]': {
      paddingTop: 0,
      height: 0,
    },
  },
});
export const privacyLink = style({
  color: 'inherit',
  textDecoration: 'underline',
});

export const footer = style({
  width: '100%',
  padding: '20px 28px',
  gap: 12,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const actionAndIndicator = style({
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  fontWeight: 500,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});
export const subscribeActions = style({
  display: 'flex',
  gap: 12,
  alignItems: 'center',
});
export const baseActionButton = style({
  fontSize: cssVar('fontBase'),
  selectors: {
    '&.large': {
      fontWeight: 500,
    },
  },
});
export const transparentActionButton = style([
  baseActionButton,
  {
    backgroundColor: 'transparent',
  },
]);
