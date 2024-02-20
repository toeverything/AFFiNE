import { globalStyle, style } from '@vanilla-extract/css';
export const editor = style({
  flex: 1,
  overflow: 'auto',
  selectors: {
    '&.full-screen': {
      vars: {
        '--affine-editor-width': '100%',
        '--affine-editor-side-padding': '15px',
      },
    },
    '&.is-public-page': {
      height: '100%',
    },
  },
});
globalStyle(`${editor} .affine-doc-viewport`, {
  paddingBottom: '150px',
  paddingLeft: '20px',
  scrollbarGutter: 'stable',
});
globalStyle('.is-public-page page-meta-tags', {
  display: 'none',
});
