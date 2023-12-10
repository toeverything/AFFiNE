import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  height: '100%',
  overflow: 'hidden',
  width: '100%',
});

export const mainContainer = style({
  display: 'flex',
  flex: 1,
  height: '100%',
  position: 'relative',
  flexDirection: 'column',
  width: '100%',
  selectors: {
    [`${root}[data-client-border] &`]: {
      borderRadius: '4px',
    },
  },
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
  zIndex: 0, // it will create stacking context to limit layer of child elements and be lower than after auto zIndex
});

export const resizeHandle = style({
  width: '1px',
  position: 'relative',
  backgroundColor: 'var(--affine-border-color)',
  selectors: {
    '&[data-collapsed=true]': {
      display: 'none',
    },
    [`${root}[data-client-border] &`]: {
      width: '8px',
      backgroundColor: 'transparent',
    },
  },
});

export const resizeHandleInner = style({
  height: '100%',
  width: '10px', // this is the real hit box
  position: 'absolute',
  transform: 'translateX(-50%)',
  zIndex: 10,
  transition: 'all 0.2s ease-in-out',
  display: 'flex',
  justifyContent: 'center',
  '::before': {
    content: '""',
    width: '0px',
    height: '100%',
    borderRadius: '2px',
    transition: 'all 0.2s ease-in-out',
  },
  selectors: {
    [`${root}[data-client-border] &`]: {
      transform: 'translateX(-1px)',
    },
    [`:is(${resizeHandle}:hover, ${resizeHandle}[data-resize-handle-active]) &::before`]:
      {
        width: '2px',
        backgroundColor: 'var(--affine-primary-color)',
      },
    [`${resizeHandle}[data-resize-handle-active] &::before`]: {
      width: '4px',
      borderRadius: '4px',
    },
  },
});

export const sidebarContainer = style({
  transition: 'flex 0.2s ease-in-out',
  display: 'flex',
  flexDirection: 'column',
  selectors: {
    [`${resizeHandle}[data-resize-handle-active] + &`]: {
      transition: 'none',
    },
    [`${root}[data-disable-animation] &`]: {
      transition: 'none',
    },
    [`${root}[data-client-border] &`]: {
      borderRadius: '4px',
    },
  },
});
