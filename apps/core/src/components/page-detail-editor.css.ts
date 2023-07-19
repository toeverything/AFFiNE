import { style } from '@vanilla-extract/css';

export const pluginContainer = style({
  height: '100%',
  width: '100%',
});

export const editor = style({
  height: 'calc(100% - 52px)',
  selectors: {
    '&.full-screen': {
      vars: {
        '--affine-editor-width': '100%',
        '--affine-editor-side-padding': '15px',
      },
    },
  },
});
