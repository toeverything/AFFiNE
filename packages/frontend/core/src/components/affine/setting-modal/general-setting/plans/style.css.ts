import { style } from '@vanilla-extract/css';

export const wrapper = style({
  width: '100%',
});
export const recurringRadioGroup = style({
  width: '256px',
});

export const radioButtonDiscount = style({
  marginLeft: '4px',
  color: 'var(--affine-primary-color)',
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
  backgroundColor: 'var(--affine-background-primary-color)',
  minHeight: '426px',
  minWidth: '258px',
  borderRadius: '16px',
  padding: '20px',
  border: '1px solid var(--affine-border-color)',
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

export const currentPlanCard = style([
  planCard,
  {
    borderWidth: '2px',
    borderColor: 'var(--affine-primary-color)',
    boxShadow: 'var(--affine-shadow-2)',
  },
]);

export const discountLabel = style({
  color: 'var(--affine-primary-color)',
  marginLeft: '8px',
  lineHeight: '20px',
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 500,
  padding: '0 4px',
  backgroundColor: 'var(--affine-blue-50)',
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
  fontSize: 'var(--affine-font-h-5)',
  marginRight: '8px',
});

export const planPriceDesc = style({
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-sm)',
});

export const planAction = style({
  width: '100%',
});

export const planBenefits = style({
  marginTop: '20px',
  fontSize: 'var(--affine-font-xs)',
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
  color: 'var(--affine-text-primary-color)',
});

export const downgradeCaption = style({
  fontSize: '14px',
  lineHeight: '22px',
  color: 'var(--affine-text-secondary-color)',
});

export const downgradeFooter = style({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '20px',
  paddingTop: '20px',
});

export const textEmphasis = style({
  color: 'var(--affine-text-emphasis-color)',
});

export const errorTip = style({
  color: 'var(--affine-text-secondary-color)',
  fontSize: '12px',
  lineHeight: '20px',
});
export const errorTipRetry = style({
  textDecoration: 'underline',
});
