import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';
export const panelWidthVar = createVar('panel-width');
export const resizeHandleOffsetVar = createVar('resize-handle-offset');
export const resizeHandleVerticalPadding = createVar(
  'resize-handle-vertical-padding'
);
export const animationTimeout = createVar();
export const root = style({
  vars: {
    [panelWidthVar]: '256px',
    [resizeHandleOffsetVar]: '0',
  },
  position: 'relative',
  width: panelWidthVar,
  minWidth: panelWidthVar,
  height: '100%',
  selectors: {
    '&[data-is-floating="true"]': {
      position: 'absolute',
      width: `calc(${panelWidthVar})`,
      zIndex: 4,
    },
    '&[data-open="true"]': {
      maxWidth: '50%',
    },
    '&[data-open="false"][data-handle-position="right"]': {
      marginLeft: `calc(${panelWidthVar} * -1)`,
    },
    '&[data-open="false"][data-handle-position="left"]': {
      marginRight: `calc(${panelWidthVar} * -1)`,
    },
    '&[data-enable-animation="true"]': {
      transition: `margin-left ${animationTimeout} .05s, margin-right ${animationTimeout} .05s, width ${animationTimeout} .05s`,
    },
    '&[data-transition-state="exited"]': {
      // avoid focus on hidden panel
      visibility: 'hidden',
    },
  },
});

export const panelContent = style({
  position: 'relative',
  height: '100%',
  overflow: 'auto',
});
export const resizeHandleContainer = style({
  position: 'absolute',
  right: resizeHandleOffsetVar,
  top: resizeHandleVerticalPadding,
  bottom: resizeHandleVerticalPadding,
  width: 8,
  zIndex: '1',
  transform: 'translateX(50%)',
  backgroundColor: 'transparent',
  opacity: 0,
  display: 'flex',
  justifyContent: 'center',
  cursor: 'col-resize',
  '@media': {
    '(max-width: 600px)': {
      // do not allow resizing on small screen
      display: 'none',
    },
  },
  transition: 'opacity 0.15s ease 0.1s',
  selectors: {
    '&[data-resizing="true"], &:hover': {
      opacity: 1,
    },
    '&[data-open="false"]': {
      display: 'none',
    },
    '&[data-open="open"]': {
      display: 'block',
    },
    '&[data-handle-position="left"]': {
      left: resizeHandleOffsetVar,
      right: 'auto',
      transform: 'translateX(-50%)',
    },
  },
});
export const resizerInner = style({
  position: 'absolute',
  height: '100%',
  width: '2px',
  borderRadius: '2px',
  backgroundColor: cssVar('primaryColor'),
  transition: 'all 0.2s ease-in-out',
  transform: 'translateX(0.5px)',
  selectors: {
    [`${resizeHandleContainer}[data-resizing="true"] &`]: {
      width: '4px',
      borderRadius: '4px',
    },
  },
});
