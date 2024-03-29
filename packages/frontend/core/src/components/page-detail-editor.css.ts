import { globalStyle, style } from '@vanilla-extract/css';
export const editor = style({
  flex: 1,
  selectors: {
    '&.full-screen': {
      vars: {
        '--affine-editor-width': '100%',
        '--affine-editor-side-padding': '15px',
      },
    },
  },
  '@media': {
    'screen and (max-width: 800px)': {
      selectors: {
        '&.is-public': {
          vars: {
            '--affine-editor-width': '100%',
            '--affine-editor-side-padding': '24px',
          },
        },
      },
    },
  },
});
globalStyle(
  `${editor} .affine-page-viewport:not(.affine-embed-synced-doc-editor)`,
  {
    paddingBottom: '150px',
  }
);
