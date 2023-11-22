import { style } from '@vanilla-extract/css';

export const errorLayout = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '100%',
  width: '100%',
});

export const errorDetailStyle = style({
  display: 'flex',
  flexDirection: 'column',
  maxWidth: '420px',
});

export const errorTitle = style({
  fontSize: '32px',
  lineHeight: '44px',
  fontWeight: 700,
});

export const errorImage = style({
  height: '178px',
  maxWidth: '400px',
  flexGrow: 1,
});

export const errorDescription = style({
  marginTop: '24px',
});

export const errorRetryButton = style({
  marginTop: '24px',
  width: '94px',
});

export const errorDivider = style({
  width: '20px',
  height: '100%',
});
