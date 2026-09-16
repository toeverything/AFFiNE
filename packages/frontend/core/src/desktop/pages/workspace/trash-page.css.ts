import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
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
export const selectAllButton = style({
  height: 24,
  padding: '2px 4px',
  color: cssVarV2.text.secondary,
  fontSize: 12,
  fontWeight: 400,
  lineHeight: '20px',
});
