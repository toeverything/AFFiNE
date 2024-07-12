import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const benefits = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});
export const li = style({
  display: 'flex',
  gap: 8,
  alignItems: 'start',
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 400,
});
globalStyle(`.${li} svg`, {
  width: 20,
  height: 20,
  color: cssVar('brandColor'),
});
