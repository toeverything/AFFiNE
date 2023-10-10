import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '16px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
});

export const headerCell = style({
  cursor: 'pointer',
  paddingLeft: '16px',
  paddingRight: '8px',
  userSelect: 'none',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&[data-sorting]': {
      color: 'var(--affine-text-primary-color)',
    },
  },
  display: 'flex',
  alignItems: 'center',
  columnGap: '4px',
});

export const headerCellSortIcon = style({
  width: '14px',
  height: '14px',
});

export const flexWrapper = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});
