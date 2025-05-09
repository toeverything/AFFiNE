import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const ItemContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '6px 16px 6px 11px',
  gap: '12px',
  cursor: 'pointer',
  borderRadius: '8px',
  transition: 'background-color 0.2s',
  fontSize: '24px',
});
export const prefixIcon = style({
  width: 24,
  height: 24,
  fontSize: 24,
  color: cssVarV2.icon.secondary,
});
export const ItemText = style({
  fontSize: cssVar('fontSm'),
  lineHeight: '22px',
  color: cssVarV2.text.secondary,
  fontWeight: 400,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
