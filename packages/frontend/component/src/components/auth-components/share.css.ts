import { cssVar } from '@toeverything/theme';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';
export const modalHeaderWrapper = style({});
globalStyle(`${modalHeaderWrapper} .logo`, {
  fontSize: cssVar('fontH3'),
  fontWeight: 600,
  color: cssVar('black'),
  marginRight: '6px',
  verticalAlign: 'middle',
});
globalStyle(`${modalHeaderWrapper} > p:first-of-type`, {
  fontSize: cssVar('fontH5'),
  fontWeight: 600,
  marginBottom: '4px',
  lineHeight: '28px',
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${modalHeaderWrapper} > p:last-of-type`, {
  fontSize: cssVar('fontH4'),
  fontWeight: 600,
  lineHeight: '28px',
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
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
});
export const formHint = style({
  fontSize: cssVar('fontSm'),
  position: 'absolute',
  bottom: '4px',
  left: 0,
  lineHeight: '22px',
  selectors: {
    '&.error': {
      color: cssVar('errorColor'),
    },
    '&.warning': {
      color: cssVar('warningColor'),
    },
  },
});
const rotate = keyframes({
  '0%': {
    transform: 'rotate(0deg)',
  },
  '50%': {
    transform: 'rotate(180deg)',
  },
  '100%': {
    transform: 'rotate(360deg)',
  },
});
export const loading = style({
  width: '15px',
  height: '15px',
  position: 'relative',
  borderRadius: '50%',
  overflow: 'hidden',
  backgroundColor: cssVar('borderColor'),
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
      backgroundColor: cssVar('blue'),
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
  fontSize: cssVar('fontBase'),
  lineHeight: cssVar('fontH3'),
  marginTop: '30px',
});
globalStyle(`${authContent} a`, {
  color: cssVar('linkColor'),
});
export const authCodeContainer = style({
  paddingBottom: '40px',
  position: 'relative',
});
export const authCodeWrapper = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const authCodeErrorMessage = style({
  color: cssVar('errorColor'),
  fontSize: cssVar('fontSm'),
  textAlign: 'center',
  lineHeight: '1.5',
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 5,
  margin: 'auto',
});
export const resendButtonWrapper = style({
  height: 32,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  marginTop: 30,
});
globalStyle(`${resendButtonWrapper} .resend-code-hint`, {
  fontWeight: 600,
  fontSize: cssVar('fontSm'),
  marginRight: 8,
});
export const authPageContainer = style({
  height: '100vh',
  width: '100vw',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: cssVar('fontBase'),
  '@media': {
    'screen and (max-width: 1024px)': {
      flexDirection: 'column',
      padding: '100px 20px',
      justifyContent: 'flex-start',
    },
  },
});
globalStyle(`${authPageContainer} .wrapper`, {
  display: 'flex',
  alignItems: 'center',
  '@media': {
    'screen and (max-width: 1024px)': {
      flexDirection: 'column',
    },
  },
});
globalStyle(`${authPageContainer} .content`, {
  maxWidth: '700px',
});
globalStyle(`${authPageContainer} .title`, {
  fontSize: cssVar('fontTitle'),
  fontWeight: 600,
  marginBottom: '28px',
});
globalStyle(`${authPageContainer} .subtitle`, {
  marginBottom: '28px',
});
globalStyle(`${authPageContainer} a`, {
  color: cssVar('linkColor'),
});
export const signInPageContainer = style({
  height: '100vh',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
});
export const input = style({
  width: '330px',
  '@media': {
    'screen and (max-width: 520px)': {
      width: '100%',
    },
  },
});

export const hideInSmallScreen = style({
  '@media': {
    'screen and (max-width: 1024px)': {
      display: 'none',
    },
  },
});
