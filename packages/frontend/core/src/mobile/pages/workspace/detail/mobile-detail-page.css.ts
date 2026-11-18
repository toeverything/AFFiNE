import { cssVar } from '@toeverything/theme';
import { bodyEmphasized } from '@toeverything/theme/typography';
import { cssVarV2 } from '@toeverything/theme/v2';
import { globalStyle, style } from '@vanilla-extract/css';

import { globalVars } from '../../../styles/variables.css';

// keyboard-toolbar-window-scroll-bug (architecture fix): `root` used to be
// `minHeight: 100dvh` -- unbounded, so the whole page grew to fit content
// instead of clipping it, meaning `document`/`<html>` itself always ended
// up genuinely scrollable on any page taller than one screen. That
// document-level scroll is what dragged the keyboard toolbar's
// `position: fixed` host along with it on iOS (confirmed live via
// mobile-debug-eval: window.scrollY tracked the toolbar's on-screen
// position almost exactly). Bounding `root` to the viewport unconditionally
// (not just for edgeless mode, which already did this) and giving
// `.affine-page-viewport` (below) genuine internal overflow makes that one
// div the actual, sole scroll container -- so `<html>`/`<body>` have
// nothing left to scroll, and the fixed toolbar has no document scroll to
// get dragged by.
export const root = style({
  background: cssVarV2('layer/background/primary'),
  height: '100dvh',
  maxHeight: '100dvh',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
});

export const header = style({
  background: cssVarV2('layer/background/primary'),
  position: 'fixed',
  top: 0,
  zIndex: 1,
});

export const headerContent = style({
  maxWidth: `calc(100% - 200px)`,
});
export const headerTitle = style([
  bodyEmphasized,
  {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',

    opacity: 0,
    transition: 'opacity 0.23s ease',
    selectors: {
      '&[data-show="true"]': {
        opacity: 1,
      },
    },
  },
]);

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
  // keyboard-toolbar-window-scroll-bug: explicit, not relying on whatever
  // produced `overflow-y: auto` here before (nothing in this file did --
  // it was an accidental side effect of the CSS spec's cross-axis
  // adjustment rule, and never created real overflow since `root` above
  // was unbounded). Now that `root` is genuinely height-constrained, this
  // flex:1 child gets a real, bounded height from its ancestor chain, so
  // this overflow-y actually does something: this becomes the one real
  // scroll container, not `<html>`/`<body>`.
  overflowY: 'auto',
  selectors: {
    '&[data-mode="edgeless"]': {
      overflowY: 'hidden',
    },
  },
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
      containerType: 'normal',
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
    },
  },
});

// keyboard-toolbar-window-scroll-bug: the equivalent of mobile.css.ts's
// `body:has(affine-keyboard-toolbar...)` padding rules, but on the actual
// scroll container instead of `<body>` -- see this file's `root` and
// `editorContainer` doc comments for why. `.affine-page-viewport` is the
// literal class name applied alongside `editorContainer`/`affineDocViewport`
// (see mobile-detail-page.tsx's `clsx(...)` call), so these target the
// same element from global scope.
globalStyle('body:has(affine-keyboard-toolbar) .affine-page-viewport', {
  paddingBottom: `calc(${globalVars.appTabSafeArea} + 46px)`,
});
globalStyle(
  'body:has(affine-keyboard-toolbar[data-keyboard-visible]) .affine-page-viewport',
  {
    paddingBottom: `calc(${globalVars.appKeyboardHeight} + 46px)`,
  }
);

export const errorBoundary = style({
  flex: 1,
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

export const journalDatePicker = style({
  background: cssVarV2('layer/background/primary'),
});

// When edgeless mode is active, prevent document-level scrolling
// so native scrollView pan gestures don't scroll the page away from the canvas
globalStyle('html:has([data-lock-document-scroll="true"])', {
  overflow: 'hidden',
  height: '100dvh',
  overscrollBehavior: 'none',
});

globalStyle('body:has([data-lock-document-scroll="true"])', {
  height: '100dvh',
  minHeight: '100dvh',
  overflow: 'hidden',
  overscrollBehavior: 'none',
});

globalStyle('body:has([data-lock-document-scroll="true"]):has(>#app-tabs)', {
  paddingBottom: 0,
});

// Prevent native touch handling on edgeless viewport so canvas handles all gestures
globalStyle('[data-mode="edgeless"] .affine-edgeless-viewport', {
  touchAction: 'none',
});
