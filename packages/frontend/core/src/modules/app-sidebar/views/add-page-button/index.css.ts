import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: 30,
  height: 30,
  borderRadius: 8,
  boxShadow: cssVar('buttonShadow'),
  borderWidth: 0,
  background: cssVarV2('button/iconButtonSolid'),
});

export const withAskRoot = style([
  root,
  {
    width: 'auto',
    padding: 7,
  },
]);

export const withAskContent = style({
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: cssVarV2.icon.primary,
});

export const templateMenu = style({
  width: 280,
});
