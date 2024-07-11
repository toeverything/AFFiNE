import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const wrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
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
export const collapsibleContent = style({
  overflow: 'hidden',
  marginTop: '4px',
  selectors: {
    '&[data-hidden="true"]': {
      display: 'none',
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
  height: '28px',
  fontSize: cssVar('fontXs'),
});
export const docsListContainer = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
});
export const noReferences = style({
  fontSize: cssVar('fontSm'),
  textAlign: 'left',
  paddingLeft: '32px',
  color: cssVar('black30'),
  userSelect: 'none',
});
