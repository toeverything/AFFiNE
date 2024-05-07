import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const button = style({
  padding: '6px 10px',
  borderRadius: '8px',
  background: cssVar('backgroundPrimaryColor'),
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  height: '28px',
});
