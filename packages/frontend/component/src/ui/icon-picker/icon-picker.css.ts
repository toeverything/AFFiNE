import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  width: 390,
  maxWidth: '100%',
  height: 400,
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  padding: '12px 12px 0px 12px',
});
export const headerContent = style({
  borderBottom: `0.5px solid ${cssVarV2.layer.insideBorder.border}`,
  display: 'flex',
  justifyContent: 'space-between',
});
export const headerNav = style({
  backgroundColor: 'transparent',
});
export const headerNavItem = style({
  marginBottom: 6,
  fontSize: 14,
});

export const main = style({
  height: 0,
  flexGrow: 1,
});
