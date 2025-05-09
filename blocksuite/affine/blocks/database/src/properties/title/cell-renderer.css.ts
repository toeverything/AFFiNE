import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { style } from '@vanilla-extract/css';

export const titleCellStyle = style({
  width: '100%',
  display: 'flex',
});

export const titleRichTextStyle = style({
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

export const headerAreaIconStyle = style({
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
