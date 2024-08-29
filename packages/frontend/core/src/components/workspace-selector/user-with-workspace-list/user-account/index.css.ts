import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const userAccountContainer = style({
  display: 'flex',
  padding: '4px 4px 4px 12px',
  gap: '8px',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
});
export const userEmail = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 400,
  lineHeight: '22px',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  whiteSpace: 'nowrap',
});
export const leftContainer = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  overflow: 'hidden',
});
