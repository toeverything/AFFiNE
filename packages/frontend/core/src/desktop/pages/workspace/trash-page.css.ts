import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const trashTitle = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '0 8px',
  fontWeight: 600,
  userSelect: 'none',
});
export const body = style({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  height: '100%',
  width: '100%',
});
export const trashIcon = style({
  color: cssVar('iconColor'),
  fontSize: cssVar('fontH5'),
});
