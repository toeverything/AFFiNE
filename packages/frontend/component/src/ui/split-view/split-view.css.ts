import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';

export const splitViewRoot = style({
  position: 'relative',
});
export const splitViewPanelsWrapper = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'stretch',
});
export const splitViewRootDragMask = style({
  position: 'absolute',
  inset: 0,
  zIndex: 1,
});

export const splitViewPanel = style({
  width: 0,

  selectors: {
    [`.${splitViewRoot}[data-dragging="true"] &`]: {
      transition: 'all 0.23s ease',
    },
  },
});

export const resizeBar = style({
  overflow: 'hidden',
  flexShrink: 0,
  width: 0,

  selectors: {
    [`.${splitViewRoot}[data-dragging="true"] &`]: {
      transition: 'all 0.23s ease',
    },

    // resize
    '&[data-type="resize"]': {
      width: 8,
      position: 'relative',
      cursor: 'col-resize',
    },

    '&[data-type="resize"]::after': {
      content: '""',
      width: 2,
      height: '100%',
      position: 'absolute',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      borderRadius: 2,
      background: 'transparent',
    },

    '&[data-type="resize"]:hover::after, &[data-type="resize"][data-resizing="true"]::after':
      {
        background: cssVar('brandColor'),
      },

    // insert
    '&[data-type="insert"]': {
      borderRadius: 4,
      border: '2px solid rgba(150, 150, 150, 0.2)',
      background: 'rgba(100, 100, 100, 0.15)',
      margin: '0 8px',
    },
    '&[data-type="insert"]:nth-child(1)': {
      marginLeft: 0,
    },
    '&[data-type="insert"]:nth-last-child(1)': {
      marginRight: 0,
    },
  },
});

// trigger
export const trigger = style({
  cursor: 'grab',

  selectors: {
    '&[data-dragging="true"]': {
      cursor: 'grabbing',
    },
  },
});

// preview
export const previewPortalOrigin = style({
  position: 'fixed',
  width: 0,
  height: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
});
