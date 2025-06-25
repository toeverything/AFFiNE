import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
  maxWidth: '400px',
  margin: '0 auto',
  color: cssVarV2('text/primary'),
  padding: '16px',
  height: 'calc(100% - 48px)',
});

export const authHeader = style({
  width: '100%',
});

export const buttonContainer = style({
  paddingTop: '16px',
});

export const mainIcon = style({
  width: 36,
  height: 36,
  color: cssVarV2('icon/primary'),
});

export const mainTitle = style({
  fontSize: '18px',
  lineHeight: '26px',
  textAlign: 'center',
  marginTop: '16px',
  fontWeight: 600,
});

export const desc = style({
  textAlign: 'center',
  color: cssVarV2('text/secondary'),
  marginBottom: '20px',
});

export const mainButton = style({
  width: '100%',
  fontSize: '14px',
  height: '42px',
});

export const workspaceSelector = style({
  width: '100%',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  padding: 6,
});
