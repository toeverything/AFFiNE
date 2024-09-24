import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

export const root = style({
  background: cssVarV2('layer/background/primary'),
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  background: cssVarV2('layer/background/primary'),
  position: 'fixed',
  top: 0,
  zIndex: 1,
});

export const mainContainer = style({
  containerType: 'inline-size',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  overflow: 'hidden',
  borderTop: `0.5px solid transparent`,
  transition: 'border-color 0.2s',
  selectors: {
    '&[data-dynamic-top-border="false"]': {
      borderColor: cssVar('borderColor'),
    },
    '&[data-has-scroll-top="true"]': {
      borderColor: cssVar('borderColor'),
    },
  },
});

export const editorContainer = style({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  zIndex: 0,
});
// brings styles of .affine-page-viewport from blocksuite
export const affineDocViewport = style({
  display: 'flex',
  flexDirection: 'column',
  containerName: 'viewport',
  containerType: 'inline-size',
  background: cssVarV2('layer/background/primary'),
  selectors: {
    '&[data-mode="edgeless"]': {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
  },
});

export const scrollbar = style({
  marginRight: '4px',
});

globalStyle('.doc-title-container', {
  fontSize: cssVar('fontH1'),
  '@container': {
    [`viewport (width <= 640px)`]: {
      padding: '10px 16px',
      lineHeight: '38px',
    },
  },
});

globalStyle('[data-peek-view-wrapper] .doc-title-container', {
  fontSize: cssVar('fontH6'),
});

globalStyle('.affine-page-root-block-container', {
  '@container': {
    [`viewport (width <= 640px)`]: {
      paddingLeft: 16,
      paddingRight: 16,
    },
  },
});

export const journalIconButton = style({
  position: 'absolute',
  zIndex: 1,
  top: 16,
  right: 12,
  display: 'flex',
});
