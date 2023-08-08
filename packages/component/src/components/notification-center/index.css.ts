// Credits to sonner
// License on the MIT
// https://github.com/emilkowalski/sonner/blob/5cb703edc108a23fd74979235c2f3c4005edd2a7/src/styles.css

import {
  globalStyle,
  keyframes,
  style,
  styleVariants,
} from '@vanilla-extract/css';

const swipeOut = keyframes({
  '0%': {
    transform:
      'translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount)))',
    opacity: 1,
  },
  '100%': {
    transform:
      'translateY(calc(var(--lift) * var(--offset) + var(--swipe-amount) + var(--lift) * -100%))',
    opacity: 0,
  },
});

export const notificationCenterViewportStyle = style({
  position: 'fixed',
  height: '500px',
  bottom: '20px',
  right: '20px',
  width: '380px',
  zIndex: 2147483647,
  outline: 'none',
  display: 'flex',
  alignItems: 'flex-end',
});
export const notificationMultimediaStyle = style({
  position: 'relative',
  width: '100%',
  height: '230px',
  borderRadius: '8px 8px 0 0',
  overflow: 'hidden',
  marginBottom: '16px',
});
globalStyle(`${notificationMultimediaStyle} > *`, {
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  cursor: 'unset',
});

export const notificationStyle = style({
  position: 'absolute',
  borderRadius: '8px',
  transition: 'transform 0.3s,opacity 0.3s, height 0.3s',
  transform: 'var(--y)',
  zIndex: 'var(--z-index)',
  opacity: 0,
  touchAction: 'none',
  willChange: 'transform, opacity, height',
  selectors: {
    '&[data-visible=false]': {
      opacity: '0 !important',
      pointerEvents: 'none',
    },
    '&[data-swiping=true]::before': {
      content: '""',
      position: 'absolute',
      left: '0',
      right: '0',
      top: '50%',
      height: '100%',
      transform: 'scaleY(3) translateY(-50%)',
    },
    '&[data-swiping=false][data-removed=true]::before': {
      content: '""',
      position: 'absolute',
      inset: '0',
      transform: 'scaleY(2)',
    },
    '&[data-mounted=true]': {
      opacity: 1,
      vars: {
        '--y': 'translateY(0)',
      },
    },
    '&[data-expanded=false][data-front=false]': {
      opacity: 1,
      height: 'var(--front-toast-height)',
      vars: {
        '--scale': 'var(--toasts-before)* 0.05 + 1',
        '--y':
          'translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)))',
      },
    },
    '&[data-mounted=true][data-expanded=true]': {
      height: 'var(--initial-height)',
      vars: {
        '--y': 'translateY(calc(var(--lift) * var(--offset)))',
      },
    },
    '&[data-removed=true][data-front=true][data-swipe-out=false]': {
      opacity: 0,
      vars: {
        '--y': 'translateY(calc(var(--lift) * -100%))',
      },
    },
    '&[data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]':
      {
        opacity: 0,
        vars: {
          '--y':
            'translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%))',
        },
      },
    '&[data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false] ':
      {
        transition: 'transform 500ms, opacity 200ms',
        opacity: 0,
        vars: {
          '--y': 'translateY(40%)',
        },
      },
    '&[data-removed=true][data-front=false]::before ': {
      height: 'calc(var(--initial-height) + 20%)',
    },
    '&[data-swiping=true]': {
      transform: 'var(--y) translateY(var(--swipe-amount, 0px))',
      transition: 'none',
    },
    '&[data-swipe-out=true]': {
      animation: `${swipeOut} 0.3s ease-in-out forwards`,
    },
  },
  vars: {
    '--y': 'translateY(100%)',
    '--lift': '-1',
    '--lift-amount': 'calc(var(--lift) * 14px)',
  },
  '::after': {
    content: '""',
    position: 'absolute',
    width: '100%',
    height: '15px',
    left: '0',
    bottom: '100%',
    borderRadius: '8px',
  },
});
export const notificationIconStyle = style({
  fontSize: '24px',
  marginLeft: '18px',
  marginRight: '8px',
  color: 'var(--affine-processing-color)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const hasMediaStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  paddingTop: '0',
  paddingBottom: '16px',
  width: '380px',
  borderRadius: '8px',
  boxShadow: 'var(--affine-shadow-1)',
  border: '1px solid var(--affine-border-color)',
  background: 'var(--affine-white)',
  transition: 'all 0.3s',
});
export const notificationContentStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  paddingTop: '16px',
  paddingBottom: '16px',
  width: '380px',
  borderRadius: '8px',
  boxShadow: 'var(--affine-shadow-1)',
  border: '1px solid var(--affine-black-10)',
  background: 'var(--affine-white)',
  transition: 'all 0.3s',
});
export const notificationTitleContactStyle = style({
  marginRight: '22px',
  width: '200px',
  overflow: 'wrap',
  lineHeight: '24px',
  fontSize: 'var(--affine-font-base)',
});
export const notificationTitleStyle = style({
  display: 'flex',
  alignItems: 'flex-start',
  width: '100%',
  justifyContent: 'flex-start',
});
export const notificationDescriptionStyle = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
  marginBottom: '4px',
  lineHeight: '22px',
});
export const notificationTimeStyle = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
  marginBottom: '4px',
});
export const closeButtonStyle = style({
  fontSize: '22px',
  marginRight: '19px',
  marginLeft: '16px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
});
export const closeButtonWithoutUndoStyle = style({
  marginLeft: '92px',
});
export const closeButtonWithMediaStyle = style({
  position: 'absolute',
  width: '22px',
  height: '22px',
  fontSize: '16px',
  top: '6px',
  right: '6px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  cursor: 'pointer',
  borderRadius: '4px',
  color: 'var(--affine-pure-black)',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
});
export const closeButtonColorStyle = style({
  color: 'var(--affine-text-primary-color)',
});
export const undoButtonStyle = style({
  fontSize: 'var(--affine-font-sm)',
  background: 'var(--affine-hover-color)',
  padding: '3px 6px',
  borderRadius: '4px',
  color: 'var(--affine-processing-color)',
  cursor: 'pointer',
});
export const undoButtonWithMediaStyle = style({
  marginLeft: 'auto',
  marginRight: '16px',
});
export const messageStyle = style({
  fontSize: 'var(--affine-font-sm)',
  width: '200px',
  marginLeft: '50px',
  lineHeight: '18px',
});
export const progressBarStyle = style({
  fontSize: 'var(--affine-font-sm)',
  width: '100%',
  height: '10px',
  marginTop: '10px',
  padding: '0 16px',
  borderRadius: '2px',
  marginBottom: '16px',
});
export const darkSuccessStyle = style({
  background: 'var(--affine-success-color)',
  borderRadius: '8px',
});
export const darkInfoStyle = style({
  background: 'var(--affine-processing-color)',
  borderRadius: '8px',
});
export const darkErrorStyle = style({
  background: 'var(--affine-error-color)',
  borderRadius: '8px',
});
export const darkWarningStyle = style({
  background: 'var(--affine-warning-color)',
  borderRadius: '8px',
});
export const lightSuccessStyle = style({
  background: 'var(--affine-background-success-color)',
  borderRadius: '8px',
});
export const lightInfoStyle = style({
  background: 'var(--affine-background-processing-color)',
  borderRadius: '8px',
});
export const lightErrorStyle = style({
  background: 'var(--affine-background-error-color)',
  borderRadius: '8px',
});
export const lightWarningStyle = style({
  background: 'var(--affine-background-warning-color)',
  borderRadius: '8px',
});
export const darkColorStyle = style({
  color: 'var(--affine-pure-white)',
});
export const lightInfoIconStyle = style({
  color: 'var(--affine-icon-color)',
});
export const defaultCollapseStyle = styleVariants({
  secondary: {
    '::after': {
      background: 'rgba(0,0,0,0.02)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
  tertiary: {
    '::after': {
      background: 'rgba(0,0,0,0.04)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
});
export const lightCollapseStyle = styleVariants({
  secondary: {
    '::after': {
      background: 'rgba(0,0,0,0.04)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
  tertiary: {
    '::after': {
      background: 'rgba(0,0,0,0.08)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
});
export const darkCollapseStyle = styleVariants({
  secondary: {
    '::after': {
      background: 'rgba(0,0,0,0.08)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
  tertiary: {
    '::after': {
      background: 'rgba(0,0,0,0.16)',
      top: '0px',
      transition: 'background-color 0.3s',
    },
  },
});
