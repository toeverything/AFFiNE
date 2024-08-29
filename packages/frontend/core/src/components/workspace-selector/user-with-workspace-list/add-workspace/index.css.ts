import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const ItemContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '8px 14px',
  gap: '14px',
  cursor: 'pointer',
  borderRadius: '8px',
  transition: 'background-color 0.2s',
  fontSize: '24px',
  color: cssVar('iconSecondary'),
});
export const ItemText = style({
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  color: cssVar('textSecondaryColor'),
  fontWeight: 400,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
