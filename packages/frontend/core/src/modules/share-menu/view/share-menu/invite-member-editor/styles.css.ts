import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const inputStyle = style({
  padding: '4px',
  gap: '4px',
  borderRadius: '4px',
  height: '30px',
});

export const iconStyle = style({
  fontSize: '20px',
  color: cssVarV2('icon/primary'),
});
