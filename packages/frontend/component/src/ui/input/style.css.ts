import { createVar, style } from '@vanilla-extract/css';

export const widthVar = createVar('widthVar');

export const inputWrapper = style({
  vars: {
    [widthVar]: '100%',
  },
  width: widthVar,
  height: 28,
  padding: '4px 10px',
  color: 'var(--affine-icon-color)',
  border: '1px solid var(--affine-border-color)',
  backgroundColor: 'var(--affine-white-10)',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: 8,
  // icon size
  fontSize: '16px',

  selectors: {
    '&.no-border': {
      border: 'unset',
    },
    // size
    '&.large': {
      height: 32,
      // icon size
      fontSize: '20px',
    },
    '&.extra-large': {
      height: 40,
      padding: '8px 10px',
      // icon size
      fontSize: '20px',
    },
    // color
    '&.disabled': {
      background: 'var(--affine-hover-color)',
    },
    '&.error': {
      borderColor: 'var(--affine-error-color)',
    },
    '&.success': {
      borderColor: 'var(--affine-success-color)',
    },
    '&.warning': {
      borderColor: 'var(--affine-warning-color)',
    },
    '&.default.focus': {
      borderColor: 'var(--affine-primary-color)',
      boxShadow: 'var(--affine-active-shadow)',
    },
  },
});

export const input = style({
  width: '0',
  flex: 1,
  fontSize: 'var(--affine-font-xs)',
  lineHeight: '20px',
  fontWeight: '500',
  color: 'var(--affine-text-primary-color)',
  boxSizing: 'border-box',
  // prevent default style
  WebkitAppearance: 'none',
  WebkitTapHighlightColor: 'transparent',
  outline: 'none',
  border: 'none',

  selectors: {
    '&::placeholder': {
      color: 'var(--affine-placeholder-color)',
    },
    '&:autofill, &:-webkit-autofill, &:-internal-autofill-selected, &:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active':
      {
        // The reason for using ‘!important’ here is:
        // The user agent style sheets of many browsers utilise !important in their :-webkit-autofill style declarations.
        // https://developer.mozilla.org/en-US/docs/Web/CSS/:autofill#:~:text=%2C%20254)-,!important,-%3B%0Abackground%2Dimage
        backgroundColor: 'var(--affine-white-10) !important',
        ['-webkit-box-shadow' as string]: 'none !important',
      },
    '&:disabled': {
      color: 'var(--affine-text-disable-color)',
    },
    '&.large, &.extra-large': {
      fontSize: 'var(--affine-font-base)',
      lineHeight: '24px',
    },
  },
});
