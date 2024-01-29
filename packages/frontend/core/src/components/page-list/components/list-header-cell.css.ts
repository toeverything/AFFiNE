import { style } from '@vanilla-extract/css';

export const headerCell = style({
  padding: '0 8px',
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
    '&:not(:last-child)': {
      borderRight: '1px solid var(--affine-hover-color-filled)',
    },
  },
  display: 'flex',
  alignItems: 'center',
  columnGap: '4px',
  position: 'relative',
  whiteSpace: 'nowrap',
});

export const headerCellSortIcon = style({
  display: 'inline-flex',
  fontSize: 14,
  color: 'var(--affine-icon-color)',
});
