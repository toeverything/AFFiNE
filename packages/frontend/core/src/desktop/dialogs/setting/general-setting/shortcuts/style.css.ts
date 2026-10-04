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
  alignItems: 'center',
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

export const shortcutRecorder = style({
  border: 0,
  padding: 0,
  color: 'inherit',
  cursor: 'pointer',
  background: 'transparent',
  outline: 'none',
});

export const shortcutKeyConflict = style({
  color: cssVar('errorColor'),
  outline: `1px solid ${cssVar('errorColor')}`,
});

export const resetShortcut = style({
  width: '20px',
  height: '20px',
  marginLeft: '4px',
  padding: 0,
  border: 0,
  color: cssVar('textSecondaryColor'),
  cursor: 'pointer',
  background: 'transparent',
});
