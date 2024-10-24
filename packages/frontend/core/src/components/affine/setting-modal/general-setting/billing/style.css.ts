import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const subscription = style({});
export const history = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '24px',
});
export const historyContent = style({
  width: '100%',
});
export const planCard = style({
  display: 'flex',
  justifyContent: 'space-between',
  padding: '12px',
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '8px',
});
export const currentPlan = style({
  flex: '1 0 0',
});
export const planAction = style({
  width: 'auto',
  marginTop: '8px',
});
export const planPrice = style({
  fontSize: cssVar('fontH6'),
  fontWeight: 600,
});
export const billingFrequency = style({
  fontSize: cssVar('fontBase'),
});
export const paymentMethod = style({
  marginTop: '24px',
});
globalStyle('.dangerous-setting .name', {
  color: cssVar('errorColor'),
});
export const noInvoice = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
});
export const currentPlanName = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVar('textEmphasisColor'),
  cursor: 'pointer',
});
export const subscriptionSettingSkeleton = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
});
export const billingHistorySkeleton = style({
  display: 'flex',
  flexDirection: 'column',
  minHeight: '72px',
  alignItems: 'center',
  justifyContent: 'center',
});

// believer-identification
export const believerHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 8,
});
export const believerTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
  color: cssVar('textPrimaryColor'),
});
export const believerSubtitle = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 400,
  color: cssVar('textSecondaryColor'),
});
globalStyle(`.${believerSubtitle} > a`, {
  color: cssVar('brandColor'),
  fontWeight: 500,
});
export const believerPriceWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'end',
});
export const believerPrice = style({
  fontSize: '18px',
  fontWeight: 600,
  lineHeight: '26px',
  color: cssVar('textPrimaryColor'),
});
export const believerPriceCaption = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
});
