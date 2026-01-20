import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const authContainer = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  width: '100%',
  minHeight: '422px',
});

export const authHeaderWrapper = style({
  marginBottom: '20px',
});
globalStyle(`${authHeaderWrapper} .logo`, {
  fontSize: cssVar('fontH3'),
  fontWeight: 600,
  color: cssVar('black'),
  marginRight: '6px',
  verticalAlign: 'middle',
});

globalStyle(`${authHeaderWrapper} > p:first-of-type`, {
  fontSize: cssVar('fontH5'),
  fontWeight: 600,
  marginBottom: '4px',
  lineHeight: '28px',
  display: 'flex',
  alignItems: 'center',
});
globalStyle(`${authHeaderWrapper} > p:last-of-type`, {
  fontSize: cssVar('fontH4'),
  fontWeight: 600,
  lineHeight: '28px',
});

export const authContent = style({
  fontSize: cssVar('fontBase'),
  lineHeight: cssVar('fontH3'),
  flexGrow: 1,
});

globalStyle(`${authContent} > *:not(:last-child)`, {
  marginBottom: '20px',
});

export const authInputWrapper = style({
  position: 'relative',
  selectors: {
    '&.with-hint': {
      marginBottom: '8px',
    },
  },
});

export const authFooter = style({});

globalStyle(`${authFooter} > *:not(:last-child)`, {
  marginBottom: '20px',
});

globalStyle(`${authInputWrapper} label`, {
  display: 'block',
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  lineHeight: '22px',
});

export const authInputError = style({
  color: cssVar('errorColor'),
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
});

globalStyle(`${authContent} a`, {
  color: cssVar('linkColor'),
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
  width: '100%',
  justifyContent: 'center',
  overflow: 'hidden',
  '@media': {
    'screen and (max-width: 1024px)': {
      flexDirection: 'column',
      justifyContent: 'flex-start',
    },
  },
});
globalStyle(`${authPageContainer} .content`, {
  maxWidth: '810px',
  '@media': {
    'screen and (min-width: 1024px)': {
      marginLeft: '200px',
      minWidth: '500px',
      marginRight: '60px',
      flexGrow: 1,
      flexShrink: 0,
      flexBasis: 0,
    },
    'screen and (max-width: 1024px)': {
      maxWidth: '600px',
      width: '100%',
      margin: 'auto',
    },
  },
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
  position: 'relative',
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

export const illustration = style({
  flexShrink: 0,
  width: '670px',
});
