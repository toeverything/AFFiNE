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
  marginBottom: 24,
});
export const actionButtons = style({
  display: 'flex',
  gap: 12,
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
export const learnAIButton = style([
  purchaseButton,
  {
    color: cssVar('textEmphasisColor'),
    paddingLeft: 16,
    paddingRight: 16,
  },
]);
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

// benefits
export const benefits = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});
export const benefitGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
});
export const benefitTitle = style({
  fontWeight: 500,
  fontSize: cssVar('fontSm'),
  lineHeight: '20px',
  color: cssVar('textPrimaryColor'),
  letterSpacing: '-2%',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});
globalStyle(`.${benefitTitle} > svg`, {
  color: cssVar('brandColor'),
});
export const benefitList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});
export const benefitItem = style({
  fontWeight: 400,
  fontSize: cssVar('fontXs'),
  lineHeight: '24px',
  paddingLeft: 22,
  position: 'relative',
  '::before': {
    content: '""',
    width: 4,
    height: 4,
    borderRadius: 2,
    background: 'currentColor',
    position: 'absolute',
    left: '10px',
    top: '10px',
  },
});
