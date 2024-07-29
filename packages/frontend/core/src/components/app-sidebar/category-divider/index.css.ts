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
  gap: '8px',
  selectors: {
    '&:not(:first-of-type)': {
      marginTop: '16px',
    },
  },
});
export const label = style({
  color: cssVar('black30'),
  flexGrow: '0',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'start',
  cursor: 'pointer',
});

export const collapseButton = style({
  selectors: {
    [`${label} > &`]: {
      color: cssVar('black30'),
      transform: 'translateY(1px)',
    },
  },
});
