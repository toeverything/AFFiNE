import { cssVar } from '@toeverything/theme';
import { style } from '@vanilla-extract/css';
export const docListHeader = style({
  height: 100,
  alignItems: 'center',
  padding: '48px 16px 20px 24px',
  overflow: 'hidden',
  display: 'flex',
  justifyContent: 'space-between',
  background: cssVar('backgroundPrimaryColor'),
});
export const docListHeaderTitle = style({
  fontSize: cssVar('fontH5'),
  fontWeight: 500,
  color: cssVar('textSecondaryColor'),
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: '28px',
  userSelect: 'none',
});
export const titleIcon = style({
  color: cssVar('iconColor'),
  display: 'inline-flex',
  alignItems: 'center',
});
export const titleCollectionName = style({
  color: cssVar('textPrimaryColor'),
});
export const addPageButton = style({
  padding: '6px 10px',
  borderRadius: '8px',
  background: cssVar('backgroundPrimaryColor'),
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  height: '32px',
});
export const tagSticky = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '1px 8px',
  color: cssVar('textPrimaryColor'),
  fontSize: cssVar('fontXs'),
  borderRadius: '10px',
  columnGap: '4px',
  border: `1px solid ${cssVar('borderColor')}`,
  background: cssVar('backgroundPrimaryColor'),
  maxWidth: '30vw',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  height: '22px',
  lineHeight: '1.67em',
  cursor: 'pointer',
});
export const tagIndicator = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
});
export const tagLabel = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const arrowDownSmallIcon = style({
  color: cssVar('iconColor'),
  fontSize: '12px',
});
export const searchIcon = style({
  color: cssVar('iconColor'),
  fontSize: '20px',
});

export const tagsEditorRoot = style({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  padding: '8px',
});

export const tagsMenu = style({
  padding: 0,
  width: '296px',
  overflow: 'hidden',
});

export const tagsEditorSelectedTags = style({
  display: 'flex',
  gap: '8px',
  flexWrap: 'nowrap',
  padding: '6px 12px',
  minHeight: 42,
  alignItems: 'center',
});

export const searchInput = style({
  flexGrow: 1,
  padding: '10px 0',
  margin: '-10px 0',
  border: 'none',
  outline: 'none',
  fontSize: cssVar('fontSm'),
  fontFamily: 'inherit',
  color: 'inherit',
  backgroundColor: 'transparent',
  '::placeholder': {
    color: cssVar('placeholderColor'),
  },
  overflow: 'hidden',
});

export const tagsEditorTagsSelector = style({
  display: 'flex',
  flexDirection: 'column',
  maxHeight: '400px',
  overflow: 'auto',
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
  padding: '4px 16px',
  height: '32px',
  gap: 8,
  fontSize: cssVar('fontSm'),
  cursor: 'pointer',
  borderRadius: '4px',
  color: cssVar('textPrimaryColor'),
  ':hover': {
    backgroundColor: cssVar('hoverColor'),
  },
  ':visited': {
    color: cssVar('textPrimaryColor'),
  },
  selectors: {
    '&.disable:hover': {
      backgroundColor: 'unset',
      cursor: 'auto',
    },
  },
});

export const tagIcon = style({
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  flexShrink: 0,
});

export const tagSelectorItemText = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
