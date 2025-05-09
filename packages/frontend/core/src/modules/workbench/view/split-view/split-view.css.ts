import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, fallbackVar, keyframes, style } from '@vanilla-extract/css';

const gap = createVar();
const borderRadius = createVar();
const resizeHandleWidth = createVar();
export const size = createVar();
export const panelOrder = createVar();
const dropIndicatorWidth = createVar();
const dropIndicatorOpacity = createVar();
const dropIndicatorRadius = createVar();

const expandDropIndicator = keyframes({
  from: {
    vars: {
      [resizeHandleWidth]: '50px',
      [dropIndicatorWidth]: '3px',
      [dropIndicatorOpacity]: '1',
      [dropIndicatorRadius]: '10px',
    },
  },
  to: {
    vars: {
      [resizeHandleWidth]: '300px',
      [dropIndicatorWidth]: '100%',
      [dropIndicatorOpacity]: '0.15',
      [dropIndicatorRadius]: '4px',
    },
  },
});

export const splitViewPanel = style({
  flexShrink: 0,
  flexGrow: fallbackVar(size, '1'),
  position: 'relative',
  order: panelOrder,
  display: 'flex',

  selectors: {
    '[data-is-resizing="true"]&': {
      transition: 'none',
    },
    '[data-is-reordering="true"]&': {
      flexGrow: 1,
    },
    '[data-client-border="false"] &[data-is-first="true"]': {
      borderTopLeftRadius: borderRadius,
    },
    '[data-client-border="false"] &:not([data-is-last="true"]):not([data-is-dragging="true"])':
      {
        borderRight: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
      },
    '[data-client-border="true"] &': {
      border: `0.5px solid ${cssVarV2('layer/insideBorder/border')}`,
      borderTopLeftRadius: borderRadius,
      borderBottomLeftRadius: borderRadius,
      borderTopRightRadius: borderRadius,
      borderBottomRightRadius: borderRadius,
    },
  },
});

export const splitViewPanelDrag = style({
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
  transition: 'opacity 0.2s',

  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      borderRadius: 'inherit',
      pointerEvents: 'none',
      zIndex: 10,

      // animate border in/out
      boxShadow: `inset 0 0 0 0 transparent`,
      transition: 'box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
    },

    '[data-is-active="true"]&::after': {
      boxShadow: `inset 0 0 0 1px ${cssVarV2('button/primary')}`,
    },

    '[data-is-dragging="true"] &': {
      opacity: 0.5,
    },
  },
});

export const splitViewPanelContent = style({
  width: '100%',
  height: '100%',
  borderRadius: 'inherit',
  overflow: 'hidden',
});

export const resizeHandle = style({
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: resizeHandleWidth,
  // to make sure it's above all-pages's header
  zIndex: 5,

  display: 'flex',
  justifyContent: 'center',
  alignItems: 'stretch',

  selectors: {
    '&[data-can-resize="false"]:not([data-state="drop-indicator"])': {
      pointerEvents: 'none',
    },

    '&[data-state="drop-indicator"]': {
      vars: {
        [resizeHandleWidth]: '50px',
      },
    },
    '&[data-edge="left"]': {
      left: `calc(${resizeHandleWidth} * -0.5)`,
      right: 'auto',
    },
    '&[data-edge="right"]': {
      left: 'auto',
      right: `calc(${resizeHandleWidth} * -0.5)`,
    },
    '&[data-edge="right"][data-is-last="true"]': {
      right: 0,
      left: 'auto',
    },
    '[data-client-border="false"] &[data-is-last="true"][data-edge="right"]::before, [data-client-border="false"] &[data-is-last="true"][data-edge="right"]::after':
      {
        transform: `translateX(calc(0.5 * ${resizeHandleWidth} - 1px))`,
      },

    '&[data-can-resize="true"]': {
      cursor: 'col-resize',
    },
    '[data-client-border="true"] &[data-edge="right"]': {
      right: `calc(${resizeHandleWidth} * -0.5 - 0.5px - ${gap} / 2)`,
    },
    [`.${splitViewPanel}[data-is-dragging="true"] &`]: {
      display: 'none',
    },

    '&[data-state="drop-indicator"][data-dragging-over="true"]': {
      animationName: expandDropIndicator,
      animationDuration: '0.5s',
      animationDelay: '1s',
      animationFillMode: 'forwards',
      vars: {
        [dropIndicatorOpacity]: '1',
        [dropIndicatorWidth]: '3px',
      },
    },

    '&::before, &::after': {
      content: '""',
      width: dropIndicatorWidth,
      position: 'absolute',
      height: '100%',
      transition: 'all 0.2s, transform 0s',
      borderRadius: dropIndicatorRadius,
    },
    '&::before': {
      background: cssVarV2('button/primary'),
      opacity: dropIndicatorOpacity,
    },
    '&[data-state="resizing"]::before, &[data-state="resizing"]::after': {
      vars: {
        [dropIndicatorWidth]: '3px',
        [dropIndicatorOpacity]: '1',
      },
    },
    '&[data-state="drop-indicator"][data-dragging-over="false"]::before': {
      vars: {
        [dropIndicatorOpacity]: '0.5',
      },
    },
    '&:is(:hover[data-can-resize="true"], [data-state="resizing"])::before': {
      vars: {
        [dropIndicatorWidth]: '3px',
        [dropIndicatorOpacity]: '1',
      },
    },
    '&:is(:hover[data-can-resize="true"], [data-state="resizing"])::after': {
      boxShadow: `0px 12px 21px 4px ${cssVarV2('button/primary')}`,
      opacity: 0.15,
    },
  },
});

export const splitViewRoot = style({
  vars: {
    [gap]: '0px',
    [borderRadius]: '6px',
    [resizeHandleWidth]: '10px',
    [dropIndicatorWidth]: '2px',
    [dropIndicatorOpacity]: '0',
    [dropIndicatorRadius]: '10px',
  },
  display: 'flex',
  flexDirection: 'row',
  position: 'relative',
  borderRadius,
  gap,
  padding: '0 10px',
  margin: '0 -10px',

  selectors: {
    '&[data-client-border="true"]': {
      vars: {
        [gap]: '8px',
      },
    },
    [`&:has(${resizeHandle}[data-dragging-over="true"])`]: {
      overflow: 'clip',
    },
  },
});

export const folderWarningMessage = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
});
