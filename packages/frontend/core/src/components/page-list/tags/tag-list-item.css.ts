import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const root = style({
  display: 'flex',
  color: cssVar('textPrimaryColor'),
  height: '54px',
  // 42 + 12
  flexShrink: 0,
  width: '100%',
  contain: 'strict',
  alignItems: 'stretch',
  transition: 'background-color 0.2s, opacity 0.2s',
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
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
export const dragPageItemOverlay = style({
  height: '45px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  background: cssVar('hoverColorFilled'),
  boxShadow: cssVar('menuShadow'),
  maxWidth: '360px',
  minWidth: '260px',
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
  backgroundColor: cssVar('placeholderColor'),
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

globalStyle(`${root} > :first-child`, {
  paddingLeft: '16px',
});
globalStyle(`${root} > :last-child`, {
  paddingRight: '8px',
});
export const titleIconsWrapper = style({
  padding: '5px',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
});
export const selectionCell = style({
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  fontSize: cssVar('fontH3'),
});
export const titleCell = style({
  display: 'flex',
  alignItems: 'flex-start',
  padding: '0 16px',
  maxWidth: 'calc(100% - 64px)',
  flex: 1,
  whiteSpace: 'nowrap',
  userSelect: 'none',
});
export const titleCellMain = style({
  overflow: 'hidden',
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  alignSelf: 'center',
  paddingRight: '4px',
});
export const titleCellPreview = style({
  overflow: 'hidden',
  color: cssVar('textSecondaryColor'),
  fontSize: cssVar('fontBase'),
  flexShrink: 0,
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  alignSelf: 'center',
});
export const iconCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontH3'),
  color: cssVar('iconColor'),
  flexShrink: 0,
});
export const tagsCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  padding: '0 8px',
  height: '60px',
  width: '100%',
});
export const dateCell = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
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
export const tagIndicatorWrapper = style({
  width: '24px',
  height: '24px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
export const tagIndicator = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
});
