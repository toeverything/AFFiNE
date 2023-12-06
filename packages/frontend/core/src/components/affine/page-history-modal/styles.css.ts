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
    [historyListWidth]: '160px',
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
  gap: 16,
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
  rowGap: 6,
});

export const historyItemGroupTitle = style({
  display: 'flex',
  alignItems: 'center',
  padding: '12px',
  fontWeight: 'bold',
  backgroundColor: 'var(--affine-background-primary-color)',
  position: 'sticky',
  top: 0,
});

export const historyItem = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0 12px',
  height: 32,
  cursor: 'pointer',
  selectors: {
    '&:hover, &[data-active=true]': {
      backgroundColor: 'var(--affine-hover-color)',
    },
  },
});

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
