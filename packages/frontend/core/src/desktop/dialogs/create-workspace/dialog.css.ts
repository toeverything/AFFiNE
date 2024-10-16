import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const header = style({
  position: 'relative',
  marginTop: '44px',
});

export const subTitle = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  fontWeight: 600,
});

export const avatarWrapper = style({
  display: 'flex',
  margin: '10px 0',
});

export const workspaceNameWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 0',
});
export const affineCloudWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  paddingTop: '10px',
});

export const card = style({
  padding: '12px',
  display: 'flex',
  alignItems: 'center',
  borderRadius: '8px',
  backgroundColor: cssVar('backgroundSecondaryColor'),
  minHeight: '114px',
  position: 'relative',
});

export const cardText = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  gap: '12px',
});

export const cardTitle = style({
  fontSize: cssVar('fontBase'),
  color: cssVar('textPrimaryColor'),
  display: 'flex',
  justifyContent: 'space-between',
});
export const cardDescription = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  maxWidth: '288px',
});

export const cloudTips = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});

export const cloudSvgContainer = style({
  width: '146px',
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  position: 'absolute',
  bottom: '0',
  right: '0',
  pointerEvents: 'none',
});
