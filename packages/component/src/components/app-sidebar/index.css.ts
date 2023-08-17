import { baseTheme } from '@toeverything/theme';
import type { ComplexStyleRule } from '@vanilla-extract/css';
import { createVar, style } from '@vanilla-extract/css';

export const floatingMaxWidth = 768;
export const navWidthVar = createVar('nav-width');

export const navWrapperStyle = style({
  vars: {
    [navWidthVar]: '256px',
  },
  position: 'relative',
  width: navWidthVar,
  minWidth: navWidthVar,
  height: '100%',
  zIndex: 1,
  paddingBottom: '8px',
  backgroundColor: 'transparent',
  '@media': {
    print: {
      display: 'none',
      zIndex: -1,
    },
  },
  selectors: {
    '&[data-is-floating="true"]': {
      position: 'absolute',
      width: `calc(${navWidthVar})`,
      zIndex: 4,
      backgroundColor: 'var(--affine-background-primary-color)',
    },
    '&[data-open="false"]': {
      marginLeft: `calc(${navWidthVar} * -1)`,
    },
    '&[data-enable-animation="true"]': {
      transition: 'margin-left .3s, width .3s',
    },
    '&.has-background': {
      backgroundColor: 'var(--affine-white-60)',
      borderRight: '1px solid var(--affine-border-color)',
    },
    '&.has-border': {
      borderRight: '1px solid var(--affine-border-color)',
    },
  },
});

export const navStyle = style({
  position: 'relative',
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  zIndex: parseInt(baseTheme.zIndexModal),
  borderRight: '1px solid transparent',
});

export const navHeaderStyle = style({
  flex: '0 0 auto',
  height: '52px',
  padding: '0px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '32px',
  WebkitAppRegion: 'drag',
  selectors: {
    '&[data-is-macos-electron="true"]': {
      justifyContent: 'flex-end',
    },
  },
} as ComplexStyleRule);

export const navBodyStyle = style({
  flex: '1 1 auto',
  height: 'calc(100% - 52px)',
  display: 'flex',
  flexDirection: 'column',
});

export const sidebarFloatMaskStyle = style({
  transition: 'opacity .15s',
  opacity: 0,
  pointerEvents: 'none',
  position: 'fixed',
  top: 0,
  left: 0,
  right: '100%',
  bottom: 0,
  background: 'var(--affine-background-modal-color)',
  selectors: {
    '&[data-open="true"][data-is-floating="true"]': {
      opacity: 1,
      pointerEvents: 'auto',
      right: '0',
      zIndex: 3,
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
});
