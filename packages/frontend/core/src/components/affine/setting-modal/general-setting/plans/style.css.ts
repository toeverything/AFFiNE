import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const wrapper = style({
  width: '100%',
});
export const recurringToggleWrapper = style({
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  minHeight: 40,
});
// export const recurringToggleLabel = style({});
export const recurringToggleRecurring = style({
  fontWeight: 400,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});
export const recurringToggleDiscount = style({
  fontWeight: 600,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('brandColor'),
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
export const cloudSelect = style({
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  display: 'flex',
  gap: 8,
});
globalStyle(`.${cloudSelect} > span`, { color: cssVar('textSecondaryColor') });
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
  border: `1px solid ${cssVar('borderColor')}`,
  position: 'relative',
  userSelect: 'none',
  transition: 'all 0.23s ease',
  selectors: {
    '&::before': {
      content: '',
      position: 'absolute',
      right: 'calc(100% + var(--setting-modal-gap-x))',
      scrollSnapAlign: 'start',
    },
    '&[data-current="true"]': {
      borderColor: 'transparent',
    },
  },
});
export const planCardBorderMock = style({
  position: 'absolute',
  inset: 0,
  borderRadius: 'inherit',
  pointerEvents: 'none',
  zIndex: 1,

  '::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 'inherit',
    border: `2px solid transparent`,
    // TODO(@catsjuice): brandColor with opacity, dark mode compatibility needed
    background: `linear-gradient(180deg, ${cssVar('brandColor')}, #1E96EB33) border-box`,
    ['WebkitMask']: `linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0)`,
    [`WebkitMaskComposite`]: `destination-out`,
    maskComposite: `exclude`,
    opacity: 0,
    transition: 'opacity 0.23s ease',
  },

  selectors: {
    [`.${planCard}[data-current="true"] &::after`]: {
      opacity: 1,
    },
  },
});
export const proPlanCard = style([planCard, {}]);
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
  padding: '12px 16px',
  background: cssVar('backgroundOverlayPanelColor'),
  borderRadius: 'inherit',
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  borderBottom: '1px solid ' + cssVar('borderColor'),
  fontWeight: 600,
  overflow: 'hidden',
  position: 'relative',
});
export const planTitleSpotlight = style({});
globalStyle(`.${planTitle} > :not(.${planTitleSpotlight})`, {
  position: 'relative',
});
export const planTitleName = style({
  fontWeight: 600,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
});
export const planTitleDescription = style({
  fontWeight: 400,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
  marginBottom: 8,
});
export const planTitleTitle = style({
  fontWeight: 600,
  fontSize: cssVar('fontBase'),
  lineHeight: '20px',
  height: 20,
});
export const planTitleTitleCaption = style({
  fontWeight: 500,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
  marginLeft: 4,
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
export const resumeAction = style([planAction, {}]);
export const resumeContent = style({
  selectors: {
    [`&[data-show-hover="true"], ${resumeAction}:hover &[data-show-hover="false"]`]:
      {
        display: 'none',
      },
    [`&[data-show-hover="false"], ${resumeAction}:hover &[data-show-hover="true"]`]:
      {
        display: 'block',
      },
  },
});
export const planBenefits = style({
  fontSize: cssVar('fontXs'),
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px 16px',
});
export const planBenefitGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});
export const planBenefitGroupTitle = style({
  fontWeight: 500,
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
  color: cssVar('textSecondaryColor'),
});
export const planBenefit = style({
  display: 'flex',
  gap: '8px',
  lineHeight: '20px',
  alignItems: 'normal',
});
export const planBenefitIcon = style({
  display: 'flex',
  alignItems: 'center',
  height: '20px',
});
globalStyle(`.${planBenefitIcon} > svg`, {
  color: cssVar('brandColor'),
});
export const planBenefitText = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontXs'),
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
