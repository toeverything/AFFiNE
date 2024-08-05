import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const layout = style({
  margin: '80px auto',
  maxWidth: '536px',
});
export const upgradeBox = style({
  padding: '48px 52px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
});
export const upgradeTips = style({
  margin: '20px 0',
  color: cssVar('textSecondaryColor'),
  fontSize: '12px',
  fontStyle: 'normal',
  fontWeight: '400',
  lineHeight: '20px',
  textAlign: 'center',
});
