import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { createVar, keyframes, style } from '@vanilla-extract/css';
export const levelIndent = createVar();
export const linkItemRoot = style({
  color: 'inherit',
});
export const itemRoot = style({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '4px',
  textAlign: 'left',
  color: 'inherit',
  width: '100%',
  minHeight: '30px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 4px',
  fontSize: cssVar('fontSm'),
  position: 'relative',
  marginTop: '0px',
  selectors: {
    '&:hover': {
      background: cssVar('hoverColor'),
    },
    '&[data-active="true"]': {
      background: cssVar('hoverColor'),
    },
    '&[data-disabled="true"]': {
      cursor: 'default',
      color: cssVar('textSecondaryColor'),
      pointerEvents: 'none',
    },
    '&[data-dragging="true"]': {
      opacity: 0.5,
    },
  },
});
export const itemMain = style({
  display: 'flex',
  alignItems: 'center',
  width: 0,
  flex: 1,
  position: 'relative',
  gap: 12,
});
export const itemRenameAnchor = style({
  pointerEvents: 'none',
  position: 'absolute',
  left: 0,
  top: -10,
  width: 10,
  height: 10,
});
export const itemContent = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  alignItems: 'center',
  flex: 1,
  color: cssVarV2('text/primary'),
  lineHeight: cssVar('lineHeight'),
});
export const postfix = style({
  display: 'flex',
  alignItems: 'center',
  right: 0,
  position: 'absolute',
  opacity: 0,
  pointerEvents: 'none',
  selectors: {
    [`${itemRoot}:hover &`]: {
      opacity: 1,
      pointerEvents: 'initial',
      position: 'initial',
    },
  },
});
export const iconContainer = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: 20,
  height: 20,
  color: cssVarV2('icon/primary'),
  fontSize: 20,
});
export const collapsedIconContainer = style({
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  color: cssVarV2('icon/primary'),
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    '&[data-disabled="true"]': {
      opacity: 0.3,
      pointerEvents: 'none',
    },
    '&:hover': {
      background: cssVar('hoverColor'),
    },
  },
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});

export const collapseContentPlaceholder = style({
  display: 'none',
  selectors: {
    '&:only-child': {
      display: 'initial',
    },
  },
});

const draggedOverAnimation = keyframes({
  '0%': {
    opacity: 1,
  },
  '60%': {
    opacity: 1,
  },
  '70%': {
    opacity: 0,
  },
  '80%': {
    opacity: 1,
  },
  '90%': {
    opacity: 0,
  },
  '100%': {
    opacity: 1,
  },
});

export const contentContainer = style({
  marginTop: 2,
  paddingLeft: levelIndent,
  position: 'relative',
});

export const draggingContainer = style({
  background: cssVar('--affine-background-primary-color'),
  width: '200px',
  borderRadius: '6px',
});

export const draggedOverEffect = style({
  position: 'relative',
  selectors: {
    '&[data-tree-instruction="make-child"][data-self-dragged-over="false"]:after':
      {
        display: 'block',
        content: '""',
        position: 'absolute',
        zIndex: 1,
        background: cssVar('--affine-hover-color'),
        left: levelIndent,
        top: 0,
        width: `calc(100% - ${levelIndent})`,
        height: '100%',
      },
    '&[data-tree-instruction="make-child"][data-self-dragged-over="false"][data-open="false"]:after':
      {
        animation: `${draggedOverAnimation} 1s infinite linear`,
      },
  },
});
