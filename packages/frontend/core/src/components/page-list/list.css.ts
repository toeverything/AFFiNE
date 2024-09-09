import { cssVar } from '@toeverything/theme';
import { createContainer, style } from '@vanilla-extract/css';

import { root as collectionItemRoot } from './collections/collection-list-item.css';
import { root as pageItemRoot } from './docs/page-list-item.css';
import { root as tagItemRoot } from './tags/tag-list-item.css';
export const listRootContainer = createContainer('list-root-container');
export const pageListScrollContainer = style({
  width: '100%',
  flex: 1,
});
export const root = style({
  width: '100%',
  maxWidth: '100%',
  containerName: listRootContainer,
  containerType: 'inline-size',
  background: cssVar('backgroundPrimaryColor'),
});
export const groupsContainer = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '16px',
});
export const heading = style({});
export const colWrapper = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  overflow: 'hidden',
});
export const hideInSmallContainer = style({
  '@container': {
    [`${listRootContainer} (max-width: 800px)`]: {
      selectors: {
        '&[data-hide-item="true"]': {
          display: 'none',
        },
      },
    },
  },
});

export const hidden = style({
  display: 'none',
});
export const favoriteCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexShrink: 0,
  opacity: 0,
  selectors: {
    [`&[data-favorite], ${pageItemRoot}:hover &, ${collectionItemRoot}:hover &, ${tagItemRoot}:hover &`]:
      {
        opacity: 1,
      },
  },
});
export const clearLinkStyle = style({
  color: 'inherit',
  textDecoration: 'none',
  ':visited': {
    color: 'inherit',
  },
  ':active': {
    color: 'inherit',
  },
});

export const editTagWrapper = style({
  position: 'absolute',
  right: '0',
  width: '100%',
  height: '60px',
  display: 'none',
  zIndex: 1,
  selectors: {
    '&[data-show=true]': {
      background: cssVar('backgroundPrimaryColor'),
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'auto',
    },
  },
});

export const deleteButton = style({
  color: cssVar('iconColor'),
  ':hover': {
    background: cssVar('backgroundErrorColor'),
  },
});
export const deleteIcon = style({
  selectors: {
    [`${deleteButton}:hover &`]: {
      color: cssVar('errorColor'),
    },
  },
});
