import { style } from '@vanilla-extract/css';
export const inlineEditWrapper = style({
  position: 'relative',
  borderRadius: 4,
  padding: 4,
  display: 'inline-block',
  minWidth: 50,
  minHeight: 28,
});
export const inlineEdit = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'pre',
  wordWrap: 'break-word',
  // to avoid shrinking when <input /> show up
  border: '1px solid transparent',
  selectors: {
    [`.${inlineEditWrapper}[data-editing="true"] &`]: {
      opacity: 0,
      visibility: 'hidden',
    },
  },
});
export const inlineEditInput = style({
  position: 'absolute',
  width: '100%',
  height: '100%',
  left: 0,
  top: 0,
  opacity: 0,
  visibility: 'hidden',
  pointerEvents: 'none',
  selectors: {
    [`.${inlineEditWrapper}[data-editing="true"] &`]: {
      opacity: 1,
      visibility: 'visible',
      pointerEvents: 'auto',
    },
  },
});
export const placeholder = style({
  opacity: 0.8,
});
