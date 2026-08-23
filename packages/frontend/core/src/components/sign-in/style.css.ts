import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const authMessage = style({
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontXs'),
  lineHeight: '20px',
});

globalStyle(`${authMessage} a`, {
  color: cssVar('linkColor'),
});

globalStyle(`${authMessage} .link`, {
  cursor: 'pointer',
  color: cssVar('linkColor'),
});

export const captchaWrapper = style({
  margin: 'auto',
  marginBottom: '4px',
  textAlign: 'center',
});

export const passwordButtonRow = style({
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: '30px',
});

export const linkButton = style({
  color: cssVar('linkColor'),
  background: 'transparent',
  borderColor: 'transparent',
  fontSize: cssVar('fontXs'),
  lineHeight: '22px',
  userSelect: 'none',
});

export const addSelfhostedButton = style({
  color: cssVarV2('text/link'),
});

export const addSelfhostedButtonPrefix = style({
  color: cssVarV2('text/link'),
});

export const skipDivider = style({
  display: 'flex',
  gap: 12,
  alignItems: 'center',
  height: 20,
});

export const skipDividerLine = style({
  flex: 1,
  height: 0,
  borderBottom: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const skipDividerText = style({
  color: cssVarV2('text/secondary'),
  fontSize: cssVar('fontXs'),
});

export const skipText = style({
  color: cssVarV2('text/primary'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
});

export const skipLink = style({
  color: cssVarV2('text/link'),
  fontSize: cssVar('fontXs'),
});

export const skipLinkIcon = style({
  color: cssVarV2('text/link'),
});

export const skipSection = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});

export const authInput = style({
  backgroundColor: cssVarV2.button.signinbutton.background,
});

export const signInButton = style({
  backgroundColor: cssVarV2.button.signinbutton.background,
});
