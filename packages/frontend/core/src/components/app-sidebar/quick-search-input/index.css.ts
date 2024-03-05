import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  display: 'inline-flex',
  background: cssVar('white10'),
  alignItems: 'center',
  borderRadius: '8px',
  border: `1px solid ${cssVar('black10')}`,
  fontSize: cssVar('fontSm'),
  width: '100%',
  height: '36px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 12px',
  margin: '20px 0',
  position: 'relative',
});
export const icon = style({
  marginRight: '8px',
  color: cssVar('iconColor'),
  fontSize: '20px',
});
export const spacer = style({
  flex: 1,
});
export const shortcutHint = style({
  color: cssVar('black30'),
  fontSize: cssVar('fontBase'),
});
