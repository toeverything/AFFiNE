import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const notFoundPageContainer = style({
  fontSize: cssVar('fontBase'),
  color: cssVar('textPrimaryColor'),
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  width: '100%',
  padding: '0 20px',
});
export const wrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  margin: '0 auto',
});
export const info = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '24px',
  textAlign: 'center',
  marginTop: 'auto',
  paddingTop: '120px',
  marginBottom: 'auto',
});
export const largeButtonEffect = style({
  boxShadow: `${cssVar('largeButtonEffect')} !important`,
});

export const illustration = style({
  maxWidth: '100%',
  width: '670px',
});
