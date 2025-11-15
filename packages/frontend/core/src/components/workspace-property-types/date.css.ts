import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const empty = style({
  color: cssVar('placeholderColor'),
});
