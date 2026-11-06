import { cssVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from '@emotion/css';

export const titleCellStyle = css({
  width: '100%',
  display: 'flex',
  // The cell container is as tall as the row but lays its children out with
  // `align-items: start`, which pinned a 40px title to the top of a 164px row.
  // Stretching just this cell fixes the title without touching that rule, which
  // every other column shares.
  alignSelf: 'stretch',
  // And within the stretched cell, keep the icon on the same line as the text:
  // the icon is only as tall as its content, so it would otherwise ride the top.
  alignItems: 'center',
});

export const titleRichTextStyle = css({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  width: '100%',
  // Height must follow the text, not the row. At `100%` the box filled a tall
  // row and the text started at its top edge, so the title sat above the icon
  // beside it -- `justify-content` had nothing to centre because the inner
  // editor grew to fill. Letting it shrink lets the cell centre it like the icon.
  height: 'auto',
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
  color: cssVarV2.icon.primary,
  backgroundColor: 'var(--affine-background-secondary-color)',
});
