import { createVar, style } from '@vanilla-extract/css';

export const widthVar = createVar('widthVar');

export const inputWrapper = style({
  vars: {
    [widthVar]: '100%',
  },
  width: widthVar,
  height: 28,
  lineHeight: '22px',
  padding: '0 10px',
  color: 'var(--affine-text-primary-color)',
  border: '1px solid',
  backgroundColor: 'var(--affine-white)',
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: 'var(--affine-font-base)',

  selectors: {
    '&.no-border': {
      border: 'unset',
    },
    // size
    '&.large': {
      height: 32,
    },
    '&.extra-large': {
      height: 40,
      fontWeight: 600,
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
    '&.default': {
      borderColor: 'var(--affine-border-color)',
    },
    '&.default.focus': {
      borderColor: 'var(--affine-primary-color)',
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30);',
    },
  },
});

export const input = style({
  height: '100%',
  width: '0',
  flex: 1,
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
    '&:disabled': {
      color: 'var(--affine-text-disable-color)',
    },
  },
});
