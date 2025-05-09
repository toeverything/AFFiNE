import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  height: '100%',
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
});

export const titleWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});

export const title = style({
  display: 'flex',
  fontSize: cssVar('fontH4'),
  fontWeight: 600,
  lineHeight: '30px',
  whiteSpace: 'pre-wrap',
  position: 'relative',
});

export const subtitle = style({
  display: 'inline-flex',
  fontSize: cssVar('fontBase'),
  fontWeight: 400,
  lineHeight: '24px',
  whiteSpace: 'pre-wrap',
  color: cssVarV2('text/secondary'),
});

export const beta = style({
  fontSize: cssVar('fontXs'),
  background: cssVarV2('chip/label/blue'),
  padding: '0 8px',
  borderRadius: '4px',
  position: 'absolute',
  right: 32,
  top: 0,
});

export const meetingAppsWrapper = style({
  display: 'flex',
  alignItems: 'center',
  height: 100,
  margin: '20px 0',
});

export const hintsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
});

export const hints = style({
  fontSize: cssVar('fontSm'),
  lineHeight: '24px',
  whiteSpace: 'pre-wrap',
});

globalStyle(`${hints} strong`, {
  fontWeight: 600,
});

globalStyle(`${hints} ul`, {
  padding: '12px 0',
  marginLeft: 15,
});

globalStyle(`${hints} li`, {
  listStyleType: 'disc',
  padding: '6px 0',
});

globalStyle(`${hints} li::marker`, {
  color: cssVarV2('block/list/header'),
});

export const learnMoreLink = style({
  fontSize: cssVar('fontXs'),
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontWeight: 500,
  color: cssVarV2('text/primary'),
});

export const linkIcon = style({
  width: 16,
  height: 16,
  color: cssVarV2('icon/primary'),
});

export const betaFreePrompt = style({
  fontSize: cssVar('fontXs'),
  color: cssVarV2('text/secondary'),
});

export const getStartedButton = style({
  marginTop: 'auto',
  alignSelf: 'center',
});

globalStyle(`${betaFreePrompt} strong`, {
  fontWeight: 700,
});
