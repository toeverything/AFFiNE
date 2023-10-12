import { globalStyle, style } from '@vanilla-extract/css';

/**
 * Editor container element layer should be lower than header and after auto
 * The zIndex of header is 2, defined in packages/frontend/core/src/components/pure/header/style.css.tsx
 */
export const editorContainer = style({
  position: 'relative',
  zIndex: 0, // it will create stacking context to limit layer of child elements and be lower than after auto zIndex
});

export const pluginContainer = style({
  height: '100%',
  width: '100%',
});

export const editor = style({
  height: '100%',
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
