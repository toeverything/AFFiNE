import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const row = style({
  background: 'rgba(125,125,125,0.1)',
  borderRadius: 4,
  fontSize: cssVar('fontXs'),
  padding: '4px 8px',
});
