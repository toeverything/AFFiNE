import { globalStyle, keyframes, style } from '@vanilla-extract/css';

export const modalHeaderWrapper = style({});

globalStyle(`${modalHeaderWrapper} .logo`, {
  fontSize: 'var(--affine-font-h-3)',
  fontWeight: 600,
  color: 'var(--affine-blue)',
  marginRight: '6px',
  verticalAlign: 'middle',
});

globalStyle(`${modalHeaderWrapper} > p:first-of-type`, {
  fontSize: 'var(--affine-font-h-5)',
  fontWeight: 600,
  marginBottom: '4px',
  lineHeight: '28px',
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${modalHeaderWrapper} > p:last-of-type`, {
  fontSize: 'var(--affine-font-h-4)',
  fontWeight: 600,
  lineHeight: '28px',
});

export const googleButton = style({
  width: '100%',
  height: '40px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  borderRadius: '8px',
  fontSize: 'var(--affine-font-sm)',
  background: 'var(--affine-primary-color)',
  color: 'var(--affine-white)',
  borderColor: 'var(--affine-primary-color)',
  backgroundBlendMode: 'overlay',
  fontWeight: 600,
  marginTop: '30px',
  boxShadow:
    '0px 1px 2px 0px rgba(255, 255, 255, 0.25) inset, 0px 12px 21px 4px rgba(30, 150, 235, 0.15)',
});

globalStyle(`${googleButton} .google-logo`, {
  marginRight: '8px',
  fontSize: '20px',
});

export const authInputWrapper = style({
  paddingBottom: '30px',
  position: 'relative',
  selectors: {
    '&.without-hint': {
      paddingBottom: '20px',
    },
  },
});

globalStyle(`${authInputWrapper} label`, {
  display: 'block',
  color: 'var(--light-text-color-text-secondary-color, #8E8D91)',
  marginBottom: '8px',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
});
export const formHint = style({
  fontSize: 'var(--affine-font-sm)',
  position: 'absolute',
  bottom: '4px',
  left: 0,
  lineHeight: '22px',
  selectors: {
    '&.error': {
      color: 'var(--affine-error-color)',
    },
    '&.warning': {
      color: 'var(--affine-warning-color)',
    },
  },
});
const rotate = keyframes({
  '0%': { transform: 'rotate(0deg)' },
  '50%': { transform: 'rotate(180deg)' },
  '100%': { transform: 'rotate(360deg)' },
});
export const loading = style({
  width: '15px',
  height: '15px',
  position: 'relative',
  borderRadius: '50%',
  overflow: 'hidden',
  backgroundColor: 'var(--affine-border-color)',
  selectors: {
    '&::after': {
      content: '""',
      width: '12px',
      height: '12px',
      position: 'absolute',
      left: '0',
      right: '0',
      top: '0',
      bottom: '0',
      margin: 'auto',
      backgroundColor: '#fff',
      zIndex: 2,
      borderRadius: '50%',
    },
    '&::before': {
      content: '""',
      width: '20px',
      height: '20px',
      backgroundColor: 'var(--affine-blue)',
      position: 'absolute',
      left: '50%',
      bottom: '50%',
      zIndex: '1',
      transformOrigin: 'left bottom',
      animation: `${rotate} 1.5s infinite linear`,
    },
  },
});

export const authContent = style({
  fontSize: 'var(--affine-font-base)',
  lineHeight: 'var(--affine-font-h-3)',
  marginTop: '30px',
});
globalStyle(`${authContent} a`, {
  color: 'var(--affine-link-color)',
});

export const authCodeContainer = style({
  paddingBottom: '8px',
});
export const authCodeWrapper = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});

export const authCodeErrorMessage = style({
  color: 'var(--affine-error-color)',
  fontSize: 'var(--affine-font-sm)',
  marginTop: '8px',
  textAlign: 'center',
  lineHeight: '1.5',
});
export const authInput = style({
  lineHeight: '22px',
  padding: '8px 12px',
  color: 'var(--affine-text-primary-color)',
  border: '1px solid',
  backgroundColor: 'var(--affine-white)',
  borderRadius: '10px',
  textAlign: 'center',
  width: '44px',
  height: '40',
  selectors: {
    '&': {
      borderColor: 'var(--affine-border-color)', // TODO: check out disableColor,
    },
    '&:focus': {
      borderColor: 'var(--affine-primary-color)',
      boxShadow:
        '0px 0px 30px 0px rgba(75, 75, 75, 0.20), 0px 0px 4px 0px rgba(75, 75, 75, 0.30), 0px 0px 0px 1px #E3E2E4 inset',
    },
    '&.error': {
      borderColor: 'var(--affine-error-color)',
    },
    '&.error:focus': {
      borderColor: 'var(--affine-error-color)',
      boxShadow:
        '0px 0px 30px 0px rgba(75, 75, 75, 0.20), 0px 0px 4px 0px rgba(75, 75, 75, 0.30), 0px 0px 0px 1px #E3E2E4 inset',
    },
  },
});
