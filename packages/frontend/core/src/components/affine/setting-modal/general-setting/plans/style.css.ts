import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const wrapper = style({
  width: '100%',
});
export const recurringRadioGroup = style({
  width: '256px',
});
export const radioButtonDiscount = style({
  marginLeft: '4px',
  color: cssVar('brandColor'),
  fontWeight: 400,
});
export const radioButtonText = style({
  selectors: {
    '&:first-letter': {
      textTransform: 'uppercase',
    },
  },
});
export const planCardsWrapper = style({
  paddingRight: 'calc(var(--setting-modal-gap-x) + 30px)',
  display: 'flex',
  gap: '16px',
  width: 'fit-content',
});
export const planCard = style({
  backgroundColor: cssVar('backgroundPrimaryColor'),
  minHeight: '426px',
  minWidth: '258px',
  borderRadius: '16px',
  padding: '20px',
  border: `1px solid ${cssVar('borderColor')}`,
  position: 'relative',
  selectors: {
    '&::before': {
      content: '',
      position: 'absolute',
      right: 'calc(100% + var(--setting-modal-gap-x))',
      scrollSnapAlign: 'start',
    },
  },
});
export const proPlanCard = style([
  planCard,
  {
    borderWidth: '1px',
    borderColor: cssVar('brandColor'),
    boxShadow: cssVar('shadow2'),
    position: 'relative',
    '::after': {
      content: '',
      position: 'absolute',
      inset: '-1px',
      borderRadius: 'inherit',
      boxShadow: `0px 0px 0px 2px ${cssVar('brandColor')}`,
      opacity: 0.3,
      zIndex: 1,
      pointerEvents: 'none',
    },
  },
]);
export const proPlanTitle = style({
  backgroundColor: cssVar('brandColor'),
  color: cssVar('white'),
  padding: '0px 6px',
  borderRadius: '4px',
  height: '24px',
  display: 'inline-block',
});
export const discountLabel = style({
  color: cssVar('textEmphasisColor'),
  marginLeft: '8px',
  lineHeight: '20px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  borderRadius: '4px',
  display: 'inline-block',
  height: '100%',
});
export const planTitle = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '10px',
  fontWeight: 600,
});
export const planPriceWrapper = style({
  minHeight: '28px',
  lineHeight: 1,
  display: 'flex',
  alignItems: 'flex-end',
});
export const planPrice = style({
  fontSize: cssVar('fontH5'),
  marginRight: '8px',
});
export const planPriceDesc = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontSm'),
});
export const planAction = style({
  width: '100%',
});
export const planBenefits = style({
  marginTop: '20px',
  fontSize: cssVar('fontXs'),
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
export const planBenefit = style({
  display: 'flex',
  gap: '8px',
  lineHeight: '20px',
  alignItems: 'normal',
  fontSize: '12px',
});
export const planBenefitIcon = style({
  display: 'flex',
  alignItems: 'center',
  height: '20px',
});
export const planBenefitText = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});
export const downgradeContentWrapper = style({
  padding: '12px 0 20px 0px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
});
export const downgradeContent = style({
  fontSize: '15px',
  lineHeight: '24px',
  fontWeight: 400,
  color: cssVar('textPrimaryColor'),
});
export const downgradeCaption = style({
  fontSize: '14px',
  lineHeight: '22px',
  color: cssVar('textSecondaryColor'),
});
export const downgradeFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '20px',
  paddingTop: '20px',
});
export const textEmphasis = style({
  color: cssVar('textEmphasisColor'),
});
export const errorTip = style({
  color: cssVar('textSecondaryColor'),
  fontSize: '12px',
  lineHeight: '20px',
});
export const errorTipRetry = style({
  textDecoration: 'underline',
});
