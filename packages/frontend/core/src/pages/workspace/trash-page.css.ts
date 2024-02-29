import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const trashTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  fontWeight: 600,
});
export const trashIcon = style({
  color: cssVar('iconColor'),
  fontSize: cssVar('fontH5'),
});
