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

export const titleTodayTag = style({
  fontSize: 'var(--affine-font-base)',
  fontWeight: 400,
  color: 'var(--affine-brand-color)',
  padding: '0 4px',
  borderRadius: '4px',
  marginLeft: '4px',
});

export const pageReferenceIcon = style({
  verticalAlign: 'middle',
  fontSize: '1.1em',
  transform: 'translate(2px, -1px)',
});
