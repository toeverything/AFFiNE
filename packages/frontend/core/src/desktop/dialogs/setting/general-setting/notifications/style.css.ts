import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const errorMessage = style({
  color: cssVar('errorColor'),
});
