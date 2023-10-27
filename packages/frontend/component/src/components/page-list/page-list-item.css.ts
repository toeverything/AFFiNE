import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  color: 'var(--affine-text-primary-color)',
  height: '54px', // 42 + 12
  flexShrink: 0,
  width: '100%',
  alignItems: 'stretch',
  transition: 'background-color 0.2s, opacity 0.2s',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  overflow: 'hidden',
  cursor: 'default',
  willChange: 'opacity',
  selectors: {
    '&[data-clickable=true]': {
      cursor: 'pointer',
    },
  },
});

export const dragOverlay = style({
  display: 'flex',
  height: '54px', // 42 + 12
  alignItems: 'center',
  background: 'var(--affine-hover-color-filled)',
  boxShadow: 'var(--affine-menu-shadow)',
  borderRadius: 10,
  zIndex: 1001,
  cursor: 'pointer',
  maxWidth: '360px',
  transition: 'transform 0.2s',
  willChange: 'transform',
  selectors: {
    '&[data-over=true]': {
      transform: 'scale(0.8)',
    },
  },
});

export const dndCell = style({
  position: 'relative',
  marginLeft: -8,
  height: '100%',
  outline: 'none',
  paddingLeft: 8,
});

globalStyle(`[data-draggable=true] ${dndCell}:before`, {
  content: '""',
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  left: 0,
  width: 4,
  height: 4,
  transition: 'height 0.2s, opacity 0.2s',
  backgroundColor: 'var(--affine-placeholder-color)',
  borderRadius: '2px',
  opacity: 0,
  willChange: 'height, opacity',
});

globalStyle(`[data-draggable=true] ${dndCell}:hover:before`, {
  height: 12,
  opacity: 1,
});

globalStyle(`[data-draggable=true][data-dragging=true] ${dndCell}`, {
  opacity: 0.5,
});

globalStyle(`[data-draggable=true][data-dragging=true] ${dndCell}:before`, {
  height: 32,
  width: 2,
  opacity: 1,
});

// todo: remove global style
globalStyle(`${root} > :first-child`, {
  paddingLeft: '16px',
});

globalStyle(`${root} > :last-child`, {
  paddingRight: '8px',
});

export const titleIconsWrapper = style({
  padding: '0 5px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});

export const selectionCell = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  fontSize: 'var(--affine-font-h-3)',
});

export const titleCell = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  padding: '0 16px',
  maxWidth: 'calc(100% - 64px)',
  flex: 1,
  whiteSpace: 'nowrap',
});

export const titleCellMain = style({
  overflow: 'hidden',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  flex: 1,
  textOverflow: 'ellipsis',
  alignSelf: 'stretch',
});

export const titleCellPreview = style({
  overflow: 'hidden',
  color: 'var(--affine-text-secondary-color)',
  fontSize: 'var(--affine-font-xs)',
  flex: 1,
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  alignSelf: 'stretch',
});

export const iconCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 'var(--affine-font-h-3)',
  color: 'var(--affine-icon-color)',
  flexShrink: 0,
});

export const tagsCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  padding: '0 8px',
  height: '60px',
  width: '100%',
});

export const dateCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  flexShrink: 0,
  flexWrap: 'nowrap',
  padding: '0 8px',
});

export const actionsCellWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexShrink: 0,
});

export const operationsCell = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  columnGap: '6px',
  flexShrink: 0,
});
