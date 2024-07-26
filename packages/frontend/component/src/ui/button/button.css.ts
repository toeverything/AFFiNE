import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const button = style({
  display: 'inline-flex',
  justifyContent: 'center',
  alignItems: 'center',
  userSelect: 'none',
  touchAction: 'manipulation',
  flexShrink: 0,
  outline: '0',
  border: '1px solid',
  padding: '0 8px',
  borderRadius: '8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  transition: 'all .3s',
  ['WebkitAppRegion' as string]: 'no-drag',
  cursor: 'pointer',
  // changeable
  height: '28px',
  background: cssVar('white'),
  borderColor: cssVar('borderColor'),
  color: cssVar('textPrimaryColor'),
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
      fontSize: cssVar('fontBase'),
      fontWeight: 600,
    },
    '&.round.large': {
      borderRadius: '16px',
    },
    '&.extraLarge': {
      height: '40px',
      fontSize: cssVar('fontBase'),
      fontWeight: 700,
    },
    '&.extraLarge.primary': {
      boxShadow: `${cssVar('largeButtonEffect')} !important`,
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
      color: cssVar('pureWhite'),
      background: cssVar('warningColor'),
      borderColor: cssVar('black10'),
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
    '&.danger:hover': {
      color: cssVar('errorColor'),
      background: cssVar('backgroundErrorColor'),
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
      color: cssVar('pureWhite'),
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
  cursor: 'pointer',
  background: cssVar('white'),
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
    '&.danger:hover': {
      color: cssVar('errorColor'),
      background: cssVar('backgroundErrorColor'),
    },
  },
});
