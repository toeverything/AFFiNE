import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const label = style({
  selectors: {
    '&[data-untitled="true"]': {
      opacity: 0.6,
    },
  },
});
export const labelContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const labelTooltipContainer = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
});
export const favItemWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  userSelect: 'none',
});
export const collapsibleContent = style({
  overflow: 'hidden',
  marginTop: '4px',
  selectors: {
    '&[data-hidden="true"]': {
      display: 'none',
    },
  },
});
export const collapsibleContentInner = style({
  display: 'flex',
  flexDirection: 'column',
});

export const dragPageItemOverlay = style({
  display: 'flex',
  alignItems: 'center',
  background: cssVar('hoverColorFilled'),
  boxShadow: cssVar('menuShadow'),
  minHeight: '30px',
  maxWidth: '360px',
  width: '100%',
  fontSize: cssVar('fontSm'),
  gap: '8px',
  padding: '4px',
  borderRadius: '4px',
});
globalStyle(`${dragPageItemOverlay} svg`, {
  width: '20px',
  height: '20px',
  color: cssVar('iconColor'),
});
globalStyle(`${dragPageItemOverlay} span`, {
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
});
export const favoriteList = style({
  overflow: 'hidden',
  borderRadius: '4px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  selectors: {
    '&[data-over="true"]': {
      background: cssVar('hoverColorFilled'),
    },
  },
});
export const favoritePostfixItem = style({
  display: 'flex',
  alignItems: 'center',
});
export const menuItem = style({
  gap: '8px',
});
globalStyle(`${menuItem} svg`, {
  width: '20px',
  height: '20px',
  color: cssVar('iconColor'),
});
globalStyle(`${menuItem}.danger:hover svg`, {
  color: cssVar('errorColor'),
});
export const emptyFavouritesContent = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
  padding: '9px 20px 25px 21px',
});
export const emptyFavouritesIconWrapper = style({
  width: 36,
  height: 36,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  backgroundColor: cssVar('hoverColor'),
});
export const emptyFavouritesIcon = style({
  fontSize: 20,
  color: cssVar('iconSecondary'),
});
export const emptyFavouritesMessage = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'center',
  color: cssVar('black30'),
  userSelect: 'none',
});
export const noReferences = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'left',
  paddingLeft: '32px',
  color: cssVar('black30'),
  lineHeight: '30px',
  userSelect: 'none',
});
