import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';

export const titleCellStyle = css({
  width: '100%',
  display: 'flex',
});

export const titleRichTextStyle = css({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  outline: 'none',
  wordBreak: 'break-all',
  fontSize: 'var(--data-view-cell-text-size)',
  lineHeight: 'var(--data-view-cell-text-line-height)',
});

export const headerAreaIconStyle = css({
  height: 'max-content',
  display: 'flex',
  alignItems: 'center',
  marginRight: '8px',
  padding: '2px',
  borderRadius: '4px',
  marginTop: '2px',
  color: cssVarV2.icon.primary,
  backgroundColor: 'var(--affine-background-secondary-color)',
});
