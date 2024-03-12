import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  display: 'inline-flex',
  background: cssVar('white30'),
  alignItems: 'center',
  borderRadius: '8px',
  border: `1px solid ${cssVar('black10')}`,
  fontSize: cssVar('fontSm'),
  width: '100%',
  position: 'relative',
  height: '52px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 24px',
  transition: 'background 0.2s ease',
  selectors: {
    '&:active': {
      background: cssVar('white50'),
    },
  },
});
export const icon = style({
  marginRight: '18px',
  color: cssVar('iconColor'),
  fontSize: '24px',
});
export const spacer = style({
  flex: 1,
});
