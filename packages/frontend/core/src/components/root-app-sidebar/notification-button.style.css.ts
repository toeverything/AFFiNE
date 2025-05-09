import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const badge = style({
  backgroundColor: cssVarV2('button/primary'),
  color: cssVarV2('text/pureWhite'),
  minWidth: '16px',
  height: '16px',
  padding: '0px 4px',
  borderRadius: '4px',
  fontSize: '12px',
  textAlign: 'center',
  lineHeight: '16px',
  fontWeight: 500,
});
