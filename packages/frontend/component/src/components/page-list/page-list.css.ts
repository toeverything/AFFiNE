import { createContainer, keyframes, style } from '@vanilla-extract/css';

import * as itemStyles from './page-list-item.css';

export const listRootContainer = createContainer('list-root-container');

const bottomBorderAnimation = keyframes({
  '0%': {
    borderBottom: '1px solid transparent',
  },
  '1%': {
    borderBottom: '1px solid var(--affine-border-color)',
  },
  '100%': {
    borderBottom: '1px solid var(--affine-border-color)',
  },
});

export const pageListScrollContainer = style({
  overflowY: 'auto',
  width: '100%',
  scrollTimeline: '--list-scroll-root y',
});

export const root = style({
  width: '100%',
  maxWidth: '100%',
  containerName: listRootContainer,
  containerType: 'inline-size',
  background: 'var(--affine-background-primary-color)',
});

export const groupsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '16px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '10px 6px 10px 16px',
  position: 'sticky',
  overflow: 'hidden',
  zIndex: 1,
  top: 0,
  left: 0,
  background: 'var(--affine-background-primary-color)',
  animationName: `${bottomBorderAnimation}`,
  // todo: find a better way to share scroll-timeline
  animationTimeline: '--list-scroll-root',
  animationDuration: '0.5s',
  transform: 'translateY(-0.5px)', // fix sticky look through issue
});

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

export const headerTitleCell = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const headerTitleSelectionIconWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
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
    [`${listRootContainer} (max-width: 800px)`]: {
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