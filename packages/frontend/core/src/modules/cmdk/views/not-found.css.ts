import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const notFoundContainer = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '0 8px',
  marginBottom: 8,
});
export const notFoundItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0 12px',
  gap: 16,
});
export const notFoundIcon = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 20,
  color: cssVar('iconSecondary'),
  padding: '12px 0',
});
export const notFoundTitle = style({
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  fontWeight: '600',
  lineHeight: '20px',
  textAlign: 'justify',
  padding: '8px',
});
export const notFoundText = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textPrimaryColor'),
  lineHeight: '22px',
  fontWeight: '400',
});
