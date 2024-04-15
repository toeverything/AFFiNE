import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const thumb = style({
  borderRadius: 'inherit',
  borderBottomLeftRadius: 0,
  borderBottomRightRadius: 0,
  width: '100%',
  height: 211,
  background: cssVar('backgroundOverlayPanelColor'),
  overflow: 'hidden',
});
