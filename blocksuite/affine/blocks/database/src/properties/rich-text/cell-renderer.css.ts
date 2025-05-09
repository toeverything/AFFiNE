import { style } from '@vanilla-extract/css';

export const richTextCellStyle = style({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  userSelect: 'none',
});

export const richTextContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  outline: 'none',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
  wordBreak: 'break-all',
});
