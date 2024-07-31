import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';
export const dropdownBtn = style({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 10px',
  // fix dropdown button click area
  paddingRight: 0,
  color: cssVar('textPrimaryColor'),
  fontWeight: 600,
  background: cssVar('backgroundPrimaryColor'),
  border: `1px solid ${cssVar('borderColor')}`,
  borderRadius: '8px',
  fontSize: cssVar('fontSm'),
  // width: '100%',
  height: '32px',
  userSelect: 'none',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColorFilled'),
    },
    '&[data-size=default]': {
      height: 32,
    },
    '&[data-size=small]': {
      height: 28,
    },
  },
});
export const divider = style({
  width: '0.5px',
  height: '16px',
  background: cssVar('dividerColor'),
  // fix dropdown button click area
  margin: '0 4px',
  marginRight: 0,
});
export const dropdownWrapper = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingLeft: '4px',
  paddingRight: '10px',
});
export const dropdownIcon = style({
  borderRadius: '4px',
  selectors: {
    [`${dropdownWrapper}:hover &`]: {
      background: cssVar('hoverColor'),
    },
  },
});
export const radioButton = style({
  flexGrow: 1,
  flex: 1,
  selectors: {
    '&:not(:last-of-type)': {
      marginRight: '4px',
    },
  },
});
export const radioButtonContent = style({
  fontSize: cssVar('fontXs'),
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '28px',
  padding: '4px 8px',
  borderRadius: '8px',
  filter: 'drop-shadow(0px 0px 4px rgba(0, 0, 0, 0.1))',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  fontWeight: 600,
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
    '&[data-state="checked"]': {
      background: cssVar('white'),
    },
  },
});
export const radioUncheckedButton = style([
  radioButtonContent,
  {
    color: cssVar('textSecondaryColor'),
    filter: 'none',
    selectors: {
      '[data-state="checked"] > &': {
        display: 'none',
      },
    },
  },
]);
export const radioButtonGroup = style({
  display: 'inline-flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: cssVar('hoverColorFilled'),
  borderRadius: '10px',
  padding: '2px',
  // @ts-expect-error - fix electron drag
  WebkitAppRegion: 'no-drag',
});
export const button = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'manipulation',
  outline: '0',
  border: '1px solid',
  padding: '0 18px',
  borderRadius: '8px',
  fontSize: cssVar('fontBase'),
  transition: 'all .3s',
  ['WebkitAppRegion' as string]: 'no-drag',
  fontWeight: 600,
  // changeable
  height: '28px',
  background: cssVar('white'),
  borderColor: cssVarV2('layer/border'),
  color: cssVarV2('text/primary'),
  selectors: {
    '&.text-bold': {
      fontWeight: 600,
    },
    '&:not(.without-hover):hover': {
      background: cssVar('hoverColor'),
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: cssVar('textDisableColor'),
      pointerEvents: 'none',
    },
    '&.loading': {
      cursor: 'default',
      color: cssVar('textDisableColor'),
      pointerEvents: 'none',
    },
    '&.disabled:not(.without-hover):hover, &.loading:not(.without-hover):hover':
      {
        background: 'inherit',
      },
    '&.block': {
      display: 'flex',
      width: '100%',
    },
    '&.circle': {
      borderRadius: '50%',
    },
    '&.round': {
      borderRadius: '14px',
    },
    // size
    '&.large': {
      height: '32px',
    },
    '&.round.large': {
      borderRadius: '16px',
    },
    '&.extraLarge': {
      height: '40px',
    },
    '&.round.extraLarge': {
      borderRadius: '20px',
    },
    // type
    '&.plain': {
      color: cssVar('textPrimaryColor'),
      borderColor: 'transparent',
      background: 'transparent',
    },
    '&.primary': {
      color: cssVar('pureWhite'),
      background: cssVar('primaryColor'),
      borderColor: cssVar('black10'),
      boxShadow: cssVar('buttonInnerShadow'),
    },
    '&.primary:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'primaryColor'
      )}`,
    },
    '&.primary.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.primary.disabled:not(.without-hover):hover': {
      background: cssVar('primaryColor'),
    },
    '&.error': {
      color: cssVar('pureWhite'),
      background: cssVar('errorColor'),
      borderColor: cssVar('black10'),
      boxShadow: cssVar('buttonInnerShadow'),
    },
    '&.error:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'errorColor'
      )}`,
    },
    '&.error.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.error.disabled:not(.without-hover):hover': {
      background: cssVar('errorColor'),
    },
    '&.warning': {
      color: cssVar('white'),
      background: cssVar('warningColor'),
      borderColor: cssVar('black10'),
      boxShadow: cssVar('buttonInnerShadow'),
    },
    '&.warning:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'warningColor'
      )}`,
    },
    '&.warning.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.warning.disabled:not(.without-hover):hover': {
      background: cssVar('warningColor'),
    },
    '&.success': {
      color: cssVar('pureWhite'),
      background: cssVar('successColor'),
      borderColor: cssVar('black10'),
      boxShadow: cssVar('buttonInnerShadow'),
    },
    '&.success:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'successColor'
      )}`,
    },
    '&.success.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.success.disabled:not(.without-hover):hover': {
      background: cssVar('successColor'),
    },
    '&.processing': {
      color: cssVar('pureWhite'),
      background: cssVar('processingColor'),
      borderColor: cssVar('black10'),
      boxShadow: cssVar('buttonInnerShadow'),
    },
    '&.processing:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'processingColor'
      )}`,
    },
    '&.processing.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.processing.disabled:not(.without-hover):hover': {
      background: cssVar('processingColor'),
    },
  },
});
globalStyle(`${button} > span`, {
  // flex: 1,
  lineHeight: 1,
  padding: '0 4px',
});
export const buttonIcon = style({
  flexShrink: 0,
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  color: cssVar('iconColor'),
  fontSize: '16px',
  width: '16px',
  height: '16px',
  selectors: {
    '&.start': {
      marginRight: '4px',
    },
    '&.end': {
      marginLeft: '4px',
    },
    '&.large': {
      fontSize: '20px',
      width: '20px',
      height: '20px',
    },
    '&.extraLarge': {
      fontSize: '20px',
      width: '20px',
      height: '20px',
    },
    '&.color-white': {
      color: cssVar('white'),
    },
  },
});
export const iconButton = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'manipulation',
  outline: '0',
  border: '1px solid',
  borderRadius: '4px',
  transition: 'all .3s',
  ['WebkitAppRegion' as string]: 'no-drag',
  // changeable
  width: '24px',
  height: '24px',
  fontSize: '20px',
  color: cssVar('textPrimaryColor'),
  borderColor: cssVar('borderColor'),
  selectors: {
    '&.without-padding': {
      margin: '-2px',
    },
    '&.active': {
      color: cssVar('primaryColor'),
    },
    '&:not(.without-hover):hover': {
      background: cssVar('hoverColor'),
    },
    '&.disabled': {
      opacity: '.4',
      cursor: 'default',
      color: cssVar('textDisableColor'),
      pointerEvents: 'none',
    },
    '&.loading': {
      cursor: 'default',
      color: cssVar('textDisableColor'),
      pointerEvents: 'none',
    },
    '&.disabled:not(.without-hover):hover, &.loading:not(.without-hover):hover':
      {
        background: 'inherit',
      },
    // size
    '&.large': {
      width: '32px',
      height: '32px',
      fontSize: '24px',
    },
    '&.large.without-padding': {
      margin: '-4px',
    },
    '&.small': {
      width: '20px',
      height: '20px',
      fontSize: '16px',
    },
    '&.extra-small': {
      width: '16px',
      height: '16px',
      fontSize: '12px',
    },
    // type
    '&.plain': {
      color: cssVar('iconColor'),
      borderColor: 'transparent',
      background: 'transparent',
    },
    '&.plain.active': {
      color: cssVar('primaryColor'),
    },
    '&.primary': {
      color: cssVar('white'),
      background: cssVar('primaryColor'),
      borderColor: cssVar('black10'),
      boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset',
    },
    '&.primary:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'primaryColor'
      )}`,
    },
    '&.primary.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.primary.disabled:not(.without-hover):hover': {
      background: cssVar('primaryColor'),
    },
    '&.error': {
      color: cssVar('white'),
      background: cssVar('errorColor'),
      borderColor: cssVar('black10'),
      boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset',
    },
    '&.error:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'errorColor'
      )}`,
    },
    '&.error.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.error.disabled:not(.without-hover):hover': {
      background: cssVar('errorColor'),
    },
    '&.warning': {
      color: cssVar('white'),
      background: cssVar('warningColor'),
      borderColor: cssVar('black10'),
      boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset',
    },
    '&.warning:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'warningColor'
      )}`,
    },
    '&.warning.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.warning.disabled:not(.without-hover):hover': {
      background: cssVar('warningColor'),
    },
    '&.success': {
      color: cssVar('white'),
      background: cssVar('successColor'),
      borderColor: cssVar('black10'),
      boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset',
    },
    '&.success:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'successColor'
      )}`,
    },
    '&.success.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.success.disabled:not(.without-hover):hover': {
      background: cssVar('successColor'),
    },
    '&.processing': {
      color: cssVar('white'),
      background: cssVar('processingColor'),
      borderColor: cssVar('black10'),
      boxShadow: '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset',
    },
    '&.processing:not(.without-hover):hover': {
      background: `linear-gradient(0deg, rgba(0, 0, 0, 0.04) 0%, rgba(0, 0, 0, 0.04) 100%), ${cssVar(
        'processingColor'
      )}`,
    },
    '&.processing.disabled': {
      opacity: '.4',
      cursor: 'default',
    },
    '&.processing.disabled:not(.without-hover):hover': {
      background: cssVar('processingColor'),
    },
  },
});
