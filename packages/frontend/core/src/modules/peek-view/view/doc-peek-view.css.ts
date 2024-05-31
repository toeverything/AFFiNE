import { style } from '@vanilla-extract/css';

export const editor = style({
  vars: {
    '--affine-editor-width': '100%',
    '--affine-editor-side-padding': '160px',
  },
  minHeight: '100%',
});
