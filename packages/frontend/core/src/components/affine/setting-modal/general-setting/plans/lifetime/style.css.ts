import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const caption1 = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVar('textSecondaryColor'),
  marginBottom: 8,
});
export const title = style({
  fontSize: 18,
  fontWeight: 600,
  lineHeight: '26px',
  color: cssVar('textPrimaryColor'),
  marginBottom: 4,
});
export const price = style({
  fontSize: 30,
  fontWeight: 700,
  lineHeight: 'normal',
  color: cssVar('brandColor'),
  marginBottom: 24,
});
export const purchase = style({
  width: 'auto',
  height: 36,
  marginBottom: 8,
  padding: '8px 18px',
});
export const caption2 = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 400,
  marginBottom: 16,
  maxWidth: 324,
});
export const userPolicyLink = style({
  // link not ready
  // color: cssVar('textPrimaryColor'),
  // textDecoration: 'underline',
  color: 'inherit',
  cursor: 'text',
});
