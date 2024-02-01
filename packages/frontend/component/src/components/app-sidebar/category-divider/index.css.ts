import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const root = style({
  fontSize: cssVar('fontXs'),
  minHeight: '16px',
  width: 'calc(100% + 6px)',
  userSelect: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '4px',
  padding: '0 8px',
  selectors: {
    '&:not(:first-of-type)': {
      marginTop: '16px',
    },
  },
});
export const label = style({
  color: cssVar('black30'),
});
