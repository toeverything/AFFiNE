import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  alignItems: 'center',
  paddingRight: '24px',
  paddingBottom: '20px',
});

export const infoTitle = style({
  fontSize: cssVar('fontBase'),
  fontWeight: 500,
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const profileInput = style({
  fontSize: cssVar('fontXs'),
});

globalStyle(`${profileInput} input`, {
  fontSize: cssVar('fontXs'),
});

export const featureList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  width: '100%',
});

export const featureContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  fontSize: cssVar('fontSm'),
});

export const userNameAndEmail = style({
  background: cssVar('hoverColor'),
  padding: '4px',
  borderRadius: '4px',
  fontSize: cssVar('fontXs'),
});

export const avatarWrapper = style({
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'relative',
  cursor: 'pointer',
  flexShrink: '0',
  selectors: {
    '&.disable': {
      cursor: 'default',
      pointerEvents: 'none',
    },
  },
});
