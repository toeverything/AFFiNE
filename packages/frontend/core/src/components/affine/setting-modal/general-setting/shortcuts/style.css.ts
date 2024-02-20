import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const shortcutRow = style({
  height: '32px',
  marginBottom: '12px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: cssVar('fontBase'),
  selectors: {
    '&:last-of-type': {
      marginBottom: '0',
    },
  },
});
export const shortcutKeyContainer = style({
  display: 'flex',
});
export const shortcutKey = style({
  minWidth: '24px',
  height: '20px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 6px',
  borderRadius: '4px',
  background: cssVar('backgroundTertiaryColor'),
  fontSize: cssVar('fontXs'),
  selectors: {
    '&:not(:last-of-type)': {
      marginRight: '2px',
    },
  },
});
