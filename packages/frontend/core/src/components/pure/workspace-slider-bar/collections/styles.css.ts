import { cssVar } from '@toeverything/theme';
import { globalStyle, keyframes, style } from '@vanilla-extract/css';
export const wrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  userSelect: 'none',
  // marginLeft:8,
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});
export const view = style({
  display: 'flex',
  alignItems: 'center',
});
export const viewTitle = style({
  display: 'flex',
  alignItems: 'center',
});
export const title = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
globalStyle(`[data-draggable=true] ${title}:before`, {
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
globalStyle(`[data-draggable=true] ${title}:hover:before`, {
  height: 12,
  opacity: 1,
});
globalStyle(`[data-draggable=true][data-dragging=true] ${title}`, {
  opacity: 0.5,
});
globalStyle(`[data-draggable=true][data-dragging=true] ${title}:before`, {
  height: 32,
  width: 2,
  opacity: 1,
});
export const more = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 2,
  fontSize: 16,
  color: cssVar('iconColor'),
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
});
export const deleteFolder = style({
  ':hover': {
    color: cssVar('errorColor'),
    backgroundColor: cssVar('backgroundErrorColor'),
  },
});
globalStyle(`${deleteFolder}:hover svg`, {
  color: cssVar('errorColor'),
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: cssVar('borderColor'),
});
const slideDown = keyframes({
  '0%': {
    height: '0px',
  },
  '100%': {
    height: 'var(--radix-collapsible-content-height)',
  },
});
const slideUp = keyframes({
  '0%': {
    height: 'var(--radix-collapsible-content-height)',
  },
  '100%': {
    height: '0px',
  },
});
export const collapsibleContent = style({
  overflow: 'hidden',
  marginTop: '4px',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDown} 0.2s ease-in-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUp} 0.2s ease-in-out`,
    },
  },
});
export const emptyCollectionWrapper = style({
  padding: '9px 0',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
});
export const emptyCollectionContent = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
});
export const emptyCollectionIconWrapper = style({
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: cssVar('hoverColor'),
});
export const emptyCollectionIcon = style({
  fontSize: 20,
  color: cssVar('iconSecondary'),
});
export const emptyCollectionMessage = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'center',
  color: cssVar('black30'),
  userSelect: 'none',
});
export const emptyCollectionNewButton = style({
  padding: '0 8px',
  height: '30px',
  fontSize: cssVar('fontSm'),
});
