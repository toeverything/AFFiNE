import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const container = style({
  position: 'relative',
  overflow: 'hidden',
  touchAction: 'pan-y',
});
export const content = style({
  position: 'relative',
  zIndex: 1,
});
export const menu = style({
  position: 'absolute',
  left: '100%',
  top: 0,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: cssVarV2('icon/primary'),
  background: cssVarV2('layer/background/mobile/tertiary'),
});
