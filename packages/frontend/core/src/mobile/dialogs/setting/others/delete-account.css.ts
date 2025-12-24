import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const description = style({
  fontSize: cssVar('fontBase'),
  lineHeight: 1.6,
});
