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

export const title = style({
  padding: '20px 24px 8px 24px',
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
  lineHeight: '26px',
  color: cssVar('textPrimaryColor'),
});
export const description = style({
  padding: '0px 24px',
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

export const footer = style({
  padding: '20px 28px',
  gap: 12,
  display: 'flex',
  justifyContent: 'flex-end',
});

export const skipButton = style({
  fontWeight: 500,
});
