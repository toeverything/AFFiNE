import { style } from '@vanilla-extract/css';

export const groupsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '16px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '12px 16px 8px 56px',
});

export const headerCell = style({
  cursor: 'pointer',
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
