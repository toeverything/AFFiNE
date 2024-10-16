import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';

export const tagsInlineEditor = style({
  selectors: {
    '&[data-empty=true]': {
      color: cssVar('placeholderColor'),
    },
  },
});

export const tagsEditorRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: '12px',
});

export const inlineTagsContainer = style({
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  width: '100%',
});

export const tagsMenu = style({
  padding: 0,
  position: 'relative',
  top: 'calc(-3.5px + var(--radix-popper-anchor-height) * -1)',
  left: '-3.5px',
  width: 'calc(var(--radix-popper-anchor-width) + 16px)',
  overflow: 'hidden',
});

export const tagsEditorSelectedTags = style({
  display: 'flex',
  gap: '4px',
  flexWrap: 'wrap',
  padding: '10px 12px',
  backgroundColor: cssVar('hoverColor'),
  minHeight: 42,
});

export const searchInput = style({
  flexGrow: 1,
  padding: '10px 0',
  margin: '-10px 0',
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVar('placeholderColor'),
  },
});

export const tagsEditorTagsSelector = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '0 8px 8px 8px',
  maxHeight: '400px',
  overflow: 'auto',
});

export const tagsEditorTagsSelectorHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
});

export const tagSelectorTagsScrollContainer = style({
  overflowX: 'hidden',
  position: 'relative',
  maxHeight: '200px',
  gap: '8px',
});

export const tagSelectorItem = style({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  padding: '0 8px',
  height: '34px',
  gap: 8,
  cursor: 'pointer',
  borderRadius: '4px',
  selectors: {
    '&[data-focused=true]': {
      backgroundColor: cssVar('hoverColor'),
    },
  },
});

export const tagEditIcon = style({
  opacity: 0,
  selectors: {
    [`${tagSelectorItem}:hover &`]: {
      opacity: 1,
    },
  },
});

globalStyle(`${tagEditIcon}[data-state=open]`, {
  opacity: 1,
});

export const spacer = style({
  flexGrow: 1,
});

export const tagColorIconWrapper = style({
  width: 20,
  height: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const tagColorIcon = style({
  width: 16,
  height: 16,
  borderRadius: '50%',
});

export const menuItemListScrollable = style({});

export const menuItemListScrollbar = style({
  transform: 'translateX(4px)',
});

export const menuItemList = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: 200,
  overflow: 'auto',
});

globalStyle(`${menuItemList}[data-radix-scroll-area-viewport] > div`, {
  display: 'table !important',
});
