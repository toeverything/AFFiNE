import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const membersSelectorInline = style({
  selectors: {
    '&[data-empty=true]': {
      color: cssVar('placeholderColor'),
    },
    '&[data-readonly="true"]': {
      pointerEvents: 'none',
    },
  },
});

export const memberSelectorRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  gap: '4px',
});

export const memberSelectorRootMobile = style([
  memberSelectorRoot,
  {
    gap: 20,
  },
]);

export const memberSelectorMenu = style({
  padding: 0,
  position: 'relative',
  top: 'calc(-3.5px + var(--radix-popper-anchor-height) * -1)',
  left: '-3.5px',
  width: 'calc(var(--radix-popper-anchor-width) + 16px)',
  overflow: 'hidden',
  minWidth: 400,
});

export const memberSelectorDoneButton = style({
  height: '32px',
  width: '28px',
});

export const memberSelectorSelectedTags = style({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  padding: '10px 12px 0px',
  minHeight: 42,
  selectors: {
    [`${memberSelectorRootMobile} &`]: {
      borderRadius: 12,
      paddingBottom: '10px',
      backgroundColor: cssVarV2('layer/background/primary'),
    },
  },
});

export const memberDivider = style({
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

export const memberSelectorBody = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '0 8px 8px 8px',
  maxHeight: '400px',
  overflow: 'auto',
  selectors: {
    [`${memberSelectorRootMobile} &`]: {
      padding: 0,
      maxHeight: 'none',
    },
  },
});

export const memberSelectorScrollContainer = style({
  overflowX: 'hidden',
  position: 'relative',
  maxHeight: '200px',
  gap: '8px',
  selectors: {
    [`${memberSelectorRootMobile} &`]: {
      borderRadius: 12,
      backgroundColor: cssVarV2('layer/background/primary'),
      gap: 0,
      padding: 4,
      maxHeight: 'none',
    },
  },
});

export const memberSelectorItem = style({
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
    [`${memberSelectorRootMobile} &`]: {
      height: 44,
    },
    [`${memberSelectorRootMobile} &[data-focused="true"]`]: {
      height: 44,
      backgroundColor: 'transparent',
    },
  },
});

export const memberSelectorEmpty = style({
  padding: '10px 8px',
  fontSize: cssVar('fontSm'),
  color: cssVar('textSecondaryColor'),
  height: '34px',
  selectors: {
    [`${memberSelectorRootMobile} &`]: {
      height: 44,
    },
  },
});

export const memberItem = style({
  height: '22px',
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'space-between',
  ':last-child': {
    minWidth: 'max-content',
  },
});

export const memberItemInlineMode = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 8px',
  color: cssVar('textPrimaryColor'),
  borderColor: cssVar('borderColor'),
  selectors: {
    '&[data-focused=true]': {
      borderColor: cssVar('primaryColor'),
    },
  },
  fontSize: 'inherit',
  borderRadius: '10px',
  columnGap: '4px',
  borderWidth: '1px',
  borderStyle: 'solid',
  background: cssVar('backgroundPrimaryColor'),
  maxWidth: '128px',
  height: '100%',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const memberItemListMode = style({
  fontSize: 'inherit',
  padding: '4px 4px',
  columnGap: '8px',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  display: 'flex',
  minWidth: 0,
  gap: '4px',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const memberItemLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
});

export const memberItemRemove = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  borderRadius: '50%',
  flexShrink: 0,
  cursor: 'pointer',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
});

export const memberItemAvatar = style({
  marginRight: '0.5em',
});

export const inlineMemberList = style({
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  width: '100%',
  alignItems: 'center',
});
