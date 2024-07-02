import { cssVar } from '@toeverything/theme';
import { createVar, style } from '@vanilla-extract/css';
export const hoverMaxWidth = createVar();
export const root = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  minHeight: '32px',
});
export const tagsContainer = style({
  display: 'flex',
  alignItems: 'center',
});
export const tagsScrollContainer = style([
  tagsContainer,
  {
    overflowX: 'hidden',
    position: 'relative',
    height: '100%',
    gap: '8px',
  },
]);
export const tagsListContainer = style([
  tagsContainer,
  {
    flexWrap: 'wrap',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '4px',
  },
]);
export const innerContainer = style({
  display: 'flex',
  columnGap: '8px',
  alignItems: 'center',
  position: 'absolute',
  height: '100%',
  maxWidth: '100%',
  transition: 'all 0.2s 0.3s ease-in-out',
  selectors: {
    [`${root}:hover &`]: {
      maxWidth: hoverMaxWidth,
    },
  },
});

// background with linear gradient hack
export const innerBackdrop = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: '100%',
  opacity: 0,
  transition: 'all 0.2s',
  background: `linear-gradient(90deg, transparent 0%, ${cssVar(
    'hoverColorFilled'
  )} 40%)`,
  selectors: {
    [`${root}:hover &`]: {
      opacity: 1,
    },
  },
});
export const tag = style({
  height: '22px',
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'space-between',
  ':last-child': {
    minWidth: 'max-content',
  },
});
export const tagInnerWrapper = style({
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
});
export const tagInline = style([
  tagInnerWrapper,
  {
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
  },
]);
export const tagListItem = style([
  tag,
  {
    fontSize: cssVar('fontSm'),
    padding: '4px 12px',
    columnGap: '8px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    height: '30px',
  },
]);
export const showMoreTag = style({
  fontSize: cssVar('fontH5'),
  right: 0,
  position: 'sticky',
  display: 'inline-flex',
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
  userSelect: 'none',
});

export const tagRemove = style({
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
