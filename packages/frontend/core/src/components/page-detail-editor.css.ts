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
  },
});

globalStyle(`${editor} .affine-doc-viewport`, {
  paddingBottom: '150px',
});

globalStyle('.is-public-page affine-page-meta-data', {
  display: 'none',
});
