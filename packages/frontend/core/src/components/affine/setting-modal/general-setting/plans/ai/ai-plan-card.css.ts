import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const card = style({
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: 16,
  padding: 36,
});

export const titleBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 24,
});
export const titleCaption1 = style({
  fontWeight: 500,
  fontSize: cssVar('fontSm'),
  lineHeight: '14px',
  color: cssVar('brandColor'),
});
export const titleCaption2 = style({
  fontWeight: 500,
  fontSize: cssVar('fontSm'),
  lineHeight: '20px',
  color: cssVar('textPrimaryColor'),
  letterSpacing: '-2%',
});
export const title = style({
  fontWeight: 600,
  fontSize: '30px',
  lineHeight: '36px',
  letterSpacing: '-2%',
});

// action button
export const actionBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'start',
});
export const purchaseButton = style({
  minWidth: 160,
  height: 37,
  borderRadius: 18,
  fontWeight: 500,
  fontSize: cssVar('fontSm'),
  lineHeight: '14px',
  letterSpacing: '-1%',
});
export const agreement = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 400,
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});
globalStyle(`.${agreement} > a`, {
  color: cssVar('textPrimaryColor'),
  textDecoration: 'underline',
});
