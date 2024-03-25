import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const headerCell = style({
  padding: '0 8px',
  userSelect: 'none',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  selectors: {
    '&[data-sorting], &:hover': {
      color: cssVar('textPrimaryColor'),
    },
    '&[data-sortable]': {
      cursor: 'pointer',
    },
    '&:not(:last-child)': {
      borderRight: `1px solid ${cssVar('hoverColorFilled')}`,
    },
  },
  alignItems: 'center',
  columnGap: '4px',
  position: 'relative',
  whiteSpace: 'nowrap',
});
export const headerCellSortIcon = style({
  display: 'inline-flex',
  fontSize: 14,
  color: cssVar('iconColor'),
});
