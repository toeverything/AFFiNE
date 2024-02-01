import { cssVar } from '@toeverything/theme';
// Credits to sonner
// License on the MIT
// https://github.com/emilkowalski/sonner/blob/5cb703edc108a23fd74979235c2f3c4005edd2a7/src/styles.css
import { globalStyle, style, styleVariants } from '@vanilla-extract/css';
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
    '&[data-removed=true]::before': {
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
        '--scale': 'calc(1 - var(--toasts-before)* 0.05)',
        '--y':
          'translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(var(--scale))',
      },
    },
    '&[data-mounted=true][data-expanded=true]': {
      height: 'var(--initial-height)',
      vars: {
        '--y': 'translateY(calc(var(--lift) * var(--offset)))',
      },
    },
    '&[data-removed=true][data-front=true]': {
      opacity: 0,
      vars: {
        '--y': 'translateY(calc(var(--lift) * -100%))',
      },
    },
    '&[data-removed=true][data-front=false][data-expanded=true]': {
      opacity: 0,
      vars: {
        '--y':
          'translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%))',
      },
    },
    '&[data-removed=true][data-front=false][data-expanded=false] ': {
      transition: 'transform 500ms, opacity 200ms',
      opacity: 0,
      vars: {
        '--y': 'translateY(40%)',
      },
    },
    '&[data-removed=true][data-front=false]::before ': {
      height: 'calc(var(--initial-height) + 20%)',
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
  color: cssVar('processingColor'),
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
  boxShadow: cssVar('shadow1'),
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('white'),
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
  boxShadow: cssVar('shadow1'),
  border: `1px solid ${cssVar('black10')}`,
  background: cssVar('white'),
  transition: 'all 0.3s',
});
export const notificationTitleContactStyle = style({
  marginRight: '22px',
  width: '200px',
  overflow: 'wrap',
  lineHeight: '24px',
  fontSize: cssVar('fontBase'),
});
export const notificationTitleStyle = style({
  display: 'flex',
  alignItems: 'flex-start',
  width: '100%',
  justifyContent: 'flex-start',
});
export const notificationDescriptionStyle = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
  lineHeight: '22px',
});
export const notificationTimeStyle = style({
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
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
  color: cssVar('pureBlack'),
  ':hover': {
    background: cssVar('hoverColor'),
  },
});
export const closeButtonColorStyle = style({
  color: cssVar('textPrimaryColor'),
});
export const undoButtonStyle = style({
  fontSize: cssVar('fontSm'),
  background: cssVar('hoverColor'),
  padding: '3px 6px',
  borderRadius: '4px',
  color: cssVar('processingColor'),
  cursor: 'pointer',
});
export const undoButtonWithMediaStyle = style({
  marginLeft: 'auto',
  marginRight: '16px',
});
export const messageStyle = style({
  fontSize: cssVar('fontSm'),
  width: '200px',
  marginLeft: '50px',
  lineHeight: '18px',
});
export const progressBarStyle = style({
  fontSize: cssVar('fontSm'),
  width: '100%',
  height: '10px',
  marginTop: '10px',
  padding: '0 16px',
  borderRadius: '2px',
  marginBottom: '16px',
});
export const darkSuccessStyle = style({
  background: cssVar('successColor'),
  borderRadius: '8px',
});
export const darkInfoStyle = style({
  background: cssVar('processingColor'),
  borderRadius: '8px',
});
export const darkErrorStyle = style({
  background: cssVar('errorColor'),
  borderRadius: '8px',
});
export const darkWarningStyle = style({
  background: cssVar('warningColor'),
  borderRadius: '8px',
});
export const lightSuccessStyle = style({
  background: cssVar('backgroundSuccessColor'),
  borderRadius: '8px',
});
export const lightInfoStyle = style({
  background: cssVar('backgroundProcessingColor'),
  borderRadius: '8px',
});
export const lightErrorStyle = style({
  background: cssVar('backgroundErrorColor'),
  borderRadius: '8px',
});
export const lightWarningStyle = style({
  background: cssVar('backgroundWarningColor'),
  borderRadius: '8px',
});
export const darkColorStyle = style({
  color: cssVar('pureWhite'),
});
export const lightInfoIconStyle = style({
  color: cssVar('iconColor'),
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
