import { css } from '@emotion/css';

export const richTextCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  userSelect: 'none',
});

export const richTextContainerStyle = css({
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
