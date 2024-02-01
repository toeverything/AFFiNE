import { cssVar } from '@toeverything/theme';
import { createVar, globalStyle, style } from '@vanilla-extract/css';
const headerHeight = createVar('header-height');
const footerHeight = createVar('footer-height');
const historyListWidth = createVar('history-list-width');
export const root = style({
  height: '100%',
  width: '100%',
  vars: {
    [headerHeight]: '52px',
    [footerHeight]: '68px',
    [historyListWidth]: '240px',
  },
});
export const modalContent = style({
  display: 'flex',
  height: `calc(100% - ${footerHeight})`,
  width: '100%',
  position: 'absolute',
  selectors: {
    '&[data-empty="true"]': {
      opacity: 0,
      pointerEvents: 'none',
    },
  },
});
export const previewWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  width: `calc(100% - ${historyListWidth})`,
  backgroundColor: cssVar('backgroundSecondaryColor'),
});
export const previewContainer = style({
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1,
  position: 'absolute',
  bottom: 0,
  left: 40,
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
  overflow: 'hidden',
  boxShadow: cssVar('shadow3'),
  height: 'calc(100% - 40px)',
  width: `calc(100% - 80px)`,
  backgroundColor: cssVar('backgroundSecondaryColor'),
});
export const previewContainerStack1 = style([
  previewContainer,
  {
    left: 48,
    height: 'calc(100% - 32px)',
    width: `calc(100% - 96px)`,
  },
]);
export const previewContainerStack2 = style([
  previewContainer,
  {
    left: 56,
    height: 'calc(100% - 24px)',
    width: `calc(100% - 112px)`,
  },
]);
export const previewHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: headerHeight,
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  padding: '0 12px',
  flexShrink: 0,
  gap: 12,
});
export const previewHeaderTitle = style({
  fontSize: cssVar('fontXs'),
  fontWeight: 600,
  maxWidth: 400,
  // better responsiveness
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
export const previewHeaderTimestamp = style({
  color: cssVar('textSecondaryColor'),
  backgroundColor: cssVar('backgroundSecondaryColor'),
  padding: '0 10px',
  borderRadius: 4,
  fontSize: cssVar('fontXs'),
});
export const editor = style({
  height: '100%',
  flexGrow: 1,
  overflow: 'hidden',
});
export const rowWrapper = style({
  display: 'flex',
  height: '100%',
  position: 'relative',
  overflow: 'hidden',
  ':before': {
    content: '""',
    width: 1,
    height: '100%',
    backgroundColor: cssVar('borderColor'),
    position: 'absolute',
    left: 16,
    top: 0,
    bottom: 0,
    transform: 'translate(-50%)',
  },
  selectors: {
    '&:is(:last-of-type, :first-of-type):not(:last-of-type:first-of-type)::before':
      {
        height: '50%',
      },
    '&:last-of-type:first-of-type::before': {
      display: 'none',
    },
    '&:first-of-type::before': {
      top: '50%',
    },
  },
});
export const loadingContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  backgroundColor: cssVar('backgroundPrimaryColor'),
});
export const historyList = style({
  overflow: 'hidden',
  height: '100%',
  width: historyListWidth,
  flexShrink: 0,
  borderLeft: `1px solid ${cssVar('borderColor')}`,
});
export const historyListScrollable = style({
  height: `calc(100% - ${headerHeight})`,
});
export const historyListScrollableInner = style({
  display: 'flex',
  flexDirection: 'column',
});
export const historyListHeader = style({
  display: 'flex',
  alignItems: 'center',
  height: 52,
  borderBottom: `1px solid ${cssVar('borderColor')}`,
  fontWeight: 'bold',
  flexShrink: 0,
  padding: '0 12px',
});
export const historyItemGroup = style({
  display: 'flex',
  flexDirection: 'column',
});
export const historyItemGroupTitle = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px 0 4px',
  whiteSpace: 'nowrap',
  color: cssVar('textSecondaryColor'),
  gap: 4,
  backgroundColor: cssVar('backgroundPrimaryColor'),
  height: 28,
  ':hover': {
    background: cssVar('hoverColor'),
  },
});
export const historyItem = style([
  rowWrapper,
  {
    display: 'flex',
    alignItems: 'center',
    padding: '0 32px',
    height: 30,
    cursor: 'pointer',
    selectors: {
      '&:hover, &[data-active=true]': {
        backgroundColor: cssVar('hoverColor'),
      },
      // draw circle
      '&::after': {
        content: '""',
        width: 7,
        height: 7,
        backgroundColor: cssVar('backgroundSecondaryColor'),
        borderRadius: '50%',
        border: `1px solid ${cssVar('borderColor')}`,
        position: 'absolute',
        left: 16,
        top: '50%',
        bottom: 0,
        transform: 'translate(-50%, -50%)',
      },
      '&[data-active=true]::after': {
        backgroundColor: cssVar('primaryColor'),
        borderColor: cssVar('black30'),
      },
    },
  },
]);
export const historyItemGap = style([
  rowWrapper,
  {
    height: 16,
  },
]);
export const historyItemLoadMore = style([
  historyItem,
  {
    cursor: 'pointer',
    color: cssVar('textSecondaryColor'),
    flexShrink: 0,
    borderRadius: 0,
    selectors: {
      '&:hover': {
        backgroundColor: cssVar('hoverColor'),
      },
    },
  },
]);
globalStyle(`${historyItem} button`, {
  color: 'inherit',
});
export const historyFooter = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 68,
  borderTop: `1px solid ${cssVar('borderColor')}`,
  padding: '0 24px',
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
});
export const spacer = style({
  flexGrow: 1,
});
export const emptyHistoryPrompt = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
  zIndex: 1,
  gap: 20,
});
export const emptyHistoryPromptTitle = style({
  fontWeight: 600,
  fontSize: cssVar('fontH5'),
});
export const emptyHistoryPromptDescription = style({
  width: 320,
  textAlign: 'center',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="false"]': {
      transform: 'rotate(90deg)',
    },
  },
});
export const collapsedIconContainer = style({
  fontSize: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  color: 'inherit',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});
export const planPromptWrapper = style({
  padding: '4px 12px',
});
export const planPrompt = style({
  gap: 6,
  borderRadius: 8,
  flexDirection: 'column',
  padding: 10,
  fontSize: cssVar('fontXs'),
  backgroundColor: cssVar('backgroundSecondaryColor'),
});
export const planPromptTitle = style({
  fontWeight: 600,
  marginBottom: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: cssVar('textSecondaryColor'),
});
export const planPromptUpdateButton = style({
  textDecoration: 'underline',
  cursor: 'pointer',
  marginLeft: 4,
});
