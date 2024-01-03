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
  width: `calc(100% - ${historyListWidth})`,
  backgroundColor: 'var(--affine-background-secondary-color)',
});

export const previewHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: headerHeight,
  borderBottom: '1px solid var(--affine-border-color)',
  backgroundColor: 'var(--affine-background-primary-color)',
  padding: '0 12px',
  flexShrink: 0,
  gap: 12,
});

export const previewHeaderTitle = style({
  fontSize: 'var(--affine-font-xs)',
  fontWeight: 600,
  maxWidth: 400, // better responsiveness
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const previewHeaderTimestamp = style({
  color: 'var(--affine-text-secondary-color)',
  backgroundColor: 'var(--affine-background-secondary-color)',
  padding: '0 10px',
  borderRadius: 4,
  fontSize: 'var(--affine-font-xs)',
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
    backgroundColor: 'var(--affine-border-color)',
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
  backgroundColor: 'var(--affine-background-primary-color)',
});

export const historyList = style({
  overflow: 'hidden',
  height: '100%',
  width: historyListWidth,
  flexShrink: 0,
  borderLeft: '1px solid var(--affine-border-color)',
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
  borderBottom: '1px solid var(--affine-border-color)',
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
  color: 'var(--affine-text-secondary-color)',
  gap: 4,
  backgroundColor: 'var(--affine-background-primary-color)',
  height: 28,
  ':hover': {
    background: 'var(--affine-hover-color)',
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
        backgroundColor: 'var(--affine-hover-color)',
      },
      // draw circle
      '&::after': {
        content: '""',
        width: 7,
        height: 7,
        backgroundColor: 'var(--affine-background-secondary-color)',
        borderRadius: '50%',
        border: '1px solid var(--affine-border-color)',
        position: 'absolute',
        left: 16,
        top: '50%',
        bottom: 0,
        transform: 'translate(-50%, -50%)',
      },
      '&[data-active=true]::after': {
        backgroundColor: 'var(--affine-primary-color)',
        borderColor: 'var(--affine-black-30)',
      },
    },
  },
]);

export const historyItemGap = style([rowWrapper, { height: 16 }]);

export const historyItemLoadMore = style([
  historyItem,
  {
    cursor: 'pointer',
    color: 'var(--affine-text-secondary-color)',
    flexShrink: 0,
    borderRadius: 0,
    selectors: {
      '&:hover': {
        backgroundColor: 'var(--affine-hover-color)',
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
  borderTop: '1px solid var(--affine-border-color)',
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
  fontSize: 'var(--affine-font-h-5)',
});

export const emptyHistoryPromptDescription = style({
  width: 320,
  textAlign: 'center',
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
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
  fontSize: 'var(--affine-font-xs)',
  backgroundColor: 'var(--affine-background-secondary-color)',
});

export const planPromptTitle = style({
  fontWeight: 600,
  marginBottom: 14,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: 'var(--affine-text-secondary-color)',
});

export const planPromptUpdateButton = style({
  textDecoration: 'underline',
  cursor: 'pointer',
  marginLeft: 4,
});
