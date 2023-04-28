import { baseTheme } from '@toeverything/theme';
import type { ComplexStyleRule } from '@vanilla-extract/css';
import { createVar, style } from '@vanilla-extract/css';

export const floatingMaxWidth = 768;
export const navWidthVar = createVar('nav-width');

export const navStyle = style({
  position: 'relative',
  backgroundColor: 'var(--affine-background-secondary-color)',
  width: navWidthVar,
  minWidth: navWidthVar,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  transition: 'margin-left .3s',
  zIndex: parseInt(baseTheme.zIndexModal),
  borderRight: '1px solid var(--affine-border-color)',
  '@media': {
    [`(max-width: ${floatingMaxWidth}px)`]: {
      position: 'absolute',
      width: `calc(10vw + ${navWidthVar})`,
      selectors: {
        '&[data-open="false"]': {
          marginLeft: `calc((10vw + ${navWidthVar}) * -1)`,
        },
        '&[data-is-macos-electron="true"]': {
          backgroundColor: 'var(--affine-background-secondary-color)',
        },
      },
    },
  },
  selectors: {
    '&[data-open="false"]': {
      marginLeft: `calc(${navWidthVar} * -1)`,
    },
    '&[data-is-macos-electron="true"]': {
      backgroundColor: 'transparent',
    },
  },
  vars: {
    [navWidthVar]: '256px',
  },
});

export const navHeaderStyle = style({
  flex: '0 0 auto',
  height: '52px',
  padding: '0px 16px 0px 10px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  '@media': {
    [`(max-width: ${floatingMaxWidth}px)`]: {
      selectors: {
        '&[data-open="true"]': {
          WebkitAppRegion: 'no-drag',
        },
      },
    } as ComplexStyleRule,
  },
  selectors: {
    '&[data-is-macos-electron="true"]': {
      justifyContent: 'flex-end',
    },
  },
} as ComplexStyleRule);

export const navBodyStyle = style({
  flex: '1 1 auto',
});

export const navFooterStyle = style({
  flex: '0 0 auto',
  borderTop: '1px solid var(--affine-border-color)',
});

export const sidebarButtonStyle = style({
  width: '32px',
  height: '32px',
  color: 'var(--affine-icon-color)',
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
  zIndex: parseInt(baseTheme.zIndexModal) - 1,
  background: 'var(--affine-background-modal-color)',
  '@media': {
    [`(max-width: ${floatingMaxWidth}px)`]: {
      selectors: {
        '&[data-open="true"]': {
          opacity: 1,
          pointerEvents: 'auto',
          right: '0',
        },
      },
    },
  },
});
