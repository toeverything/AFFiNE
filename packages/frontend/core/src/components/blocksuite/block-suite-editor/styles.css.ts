import { style } from '@vanilla-extract/css';

export const docEditorRoot = style({
  display: 'block',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--affine-background-primary-color)',
});

// brings styles of .affine-doc-viewport from blocksuite
export const affineDocViewport = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflowX: 'hidden',
  overflowY: 'auto',
  userSelect: 'none',
  containerName: 'viewport', // todo: find out what this does in bs
  containerType: 'inline-size',
  background: 'var(--affine-background-primary-color)',
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
});

export const docContainer = style({
  display: 'block',
  flexGrow: 1,
});
