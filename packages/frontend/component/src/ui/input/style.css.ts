import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';
export const inputWrapper = style({
  width: '100%',
  height: 28,
  lineHeight: '22px',
  gap: '10px',
  color: cssVarV2('text/primary'),
  border: '1px solid',
  backgroundColor: cssVarV2('layer/background/primary'),
  borderRadius: 8,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: cssVar('fontBase'),
  boxSizing: 'border-box',
  overflow: 'hidden',
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
      background: cssVar('hoverColor'),
    },
    '&.error': {
      borderColor: cssVar('errorColor'),
    },
    '&.success': {
      borderColor: cssVar('successColor'),
    },
    '&.warning': {
      borderColor: cssVar('warningColor'),
    },
    '&.default': {
      borderColor: cssVar('borderColor'),
    },
    '&.default:is(:focus-within, :focus, :focus-visible)': {
      borderColor: cssVarV2('button/primary'),
      outline: 'none',
      boxShadow: '0px 0px 0px 2px rgba(30, 150, 235, 0.30);',
    },
  },
});
export const input = style({
  height: '100%',
  width: '0',
  flex: 1,
  boxSizing: 'border-box',
  padding: '0 12px',
  // prevent default style
  WebkitAppearance: 'none',
  WebkitTapHighlightColor: 'transparent',
  outline: 'none',
  border: 'none',
  background: 'transparent',
  selectors: {
    '&::placeholder': {
      color: cssVar('placeholderColor'),
    },
    '&:disabled': {
      color: cssVar('textDisableColor'),
    },
    '&:-webkit-autofill': {
      WebkitBoxShadow: `0 0 0 1000px ${cssVar('white')} inset`,
    },
  },
});
