import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const tagsInlineEditor = style({
  selectors: {
    '&[data-empty=true]': {
      color: cssVar('placeholderColor'),
    },
    '&[data-readonly="true"]': {
      pointerEvents: 'none',
    },
  },
});

export const tagsEditorRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: '4px',
});

export const tagsEditorRootMobile = style([
  tagsEditorRoot,
  {
    gap: 20,
  },
]);

export const tagsMenu = style({
  padding: 0,
  position: 'relative',
  top: 'calc(-3.5px + var(--radix-popper-anchor-height) * -1)',
  left: '-3.5px',
  width: 'calc(var(--radix-popper-anchor-width) + 16px)',
  overflow: 'hidden',
  minWidth: 400,
});

export const tagsEditorSelectedTags = style({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  padding: '10px 12px 0px',
  minHeight: 42,
  selectors: {
    [`${tagsEditorRootMobile} &`]: {
      borderRadius: 12,
      paddingBottom: '10px',
      backgroundColor: cssVarV2('layer/background/primary'),
    },
  },
});

export const tagsEditorDoneButton = style({
  height: '32px',
  width: '28px',
});

export const tagDivider = style({
  borderBottomColor: cssVarV2('tab/divider/divider'),
});

export const searchInput = style({
  flexGrow: 1,
  height: '30px',
  border: 'none',
  outline: 'none',
  fontSize: '14px',
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVarV2('text/placeholder'),
  },
});

export const tagsEditorTagsSelector = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '0 8px 8px 8px',
  maxHeight: '400px',
  overflow: 'auto',
  selectors: {
    [`${tagsEditorRootMobile} &`]: {
      padding: 0,
      maxHeight: 'none',
    },
  },
});

export const tagsEditorTagsSelectorHeader = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '0 8px',
  fontSize: cssVar('fontXs'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  selectors: {
    [`${tagsEditorRootMobile} &`]: {
      fontSize: cssVar('fontSm'),
    },
  },
});

export const tagSelectorTagsScrollContainer = style({
  overflowX: 'hidden',
  position: 'relative',
  maxHeight: '200px',
  gap: '8px',
  selectors: {
    [`${tagsEditorRootMobile} &`]: {
      borderRadius: 12,
      backgroundColor: cssVarV2('layer/background/primary'),
      gap: 0,
      padding: 4,
      maxHeight: 'none',
    },
  },
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
    [`${tagsEditorRootMobile} &`]: {
      height: 44,
    },
    [`${tagsEditorRootMobile} &[data-focused="true"]`]: {
      height: 44,
      backgroundColor: 'transparent',
    },
  },
});

export const tagEditIcon = style({
  opacity: 0,
  selectors: {
    [`:is(${tagSelectorItem}:hover, ${tagsEditorRootMobile}) &`]: {
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

export const tagSelectorEmpty = style({
  padding: '10px 8px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  height: '34px',
  selectors: {
    [`${tagsEditorRootMobile} &`]: {
      height: 44,
    },
  },
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
