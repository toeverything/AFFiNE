import { createContainer, style } from '@vanilla-extract/css';

import * as itemStyles from './page-list-item.css';

export const listRootContainer = createContainer('list-root-container');

export const root = style({
  width: '100%',
  maxWidth: '100%',
  containerName: listRootContainer,
  containerType: 'inline-size',
});

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
  overflow: 'hidden',
  zIndex: 1,
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

export const colWrapper = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});

export const hideInSmallContainer = style({
  '@container': {
    [`${listRootContainer} (max-width: 760px)`]: {
      display: 'none',
    },
  },
});

export const favoriteCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexShrink: 0,
  opacity: 0,
  selectors: {
    [`&[data-favorite], &${itemStyles.root}:hover &`]: {
      opacity: 1,
    },
  },
});
