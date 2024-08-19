import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: 32,
  height: 32,
  borderRadius: 8,
  boxShadow: '0px 1px 2px 0px rgba(0, 0, 0, 0.15)',
  borderWidth: 1,
  borderColor: cssVarV2('layer/insideBorder/border'),
  background: cssVarV2('button/siderbarPrimary/background'),
});
