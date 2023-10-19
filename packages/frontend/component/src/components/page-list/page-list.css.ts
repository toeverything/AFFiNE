import { style } from '@vanilla-extract/css';

export const root = style({});

export const groupsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '16px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '16px 0 8px 0',
  position: 'sticky',
  top: 0,
  left: 0,
  background: 'var(--affine-background-primary-color)',
});

export const headerCell = style({
  paddingRight: '8px',
  userSelect: 'none',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  selectors: {
    '&[data-sorting], &:hover': {
      color: 'var(--affine-text-primary-color)',
    },
    '&[data-sortable]': {
      cursor: 'pointer',
    },
  },
  display: 'flex',
  alignItems: 'center',
  columnGap: '4px',
  position: 'relative',
});

export const headerTitleCell = style({
  display: 'flex',
  alignItems: 'center',
});

export const headerTitleSelectionIconWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
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
