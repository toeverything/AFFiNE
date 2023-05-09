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
  transition: 'margin-left .3s, width .3s',
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
      WebkitAppRegion: 'drag',
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

export const haloStyle = style({
  overflow: 'hidden',
  width: '100%',
  height: '100%',
  position: 'absolute',
  top: 0,
  left: 0,
  ':before': {
    content: '""',
    display: 'block',
    width: '60%',
    height: '40%',
    position: 'absolute',
    top: '80%',
    left: '50%',
    background:
      'linear-gradient(180deg, rgba(50, 26, 206, 0.1) 10%, rgba(50, 26, 206, 0.35) 30%, rgba(84, 56, 255, 1) 50%)',
    filter: 'blur(10px) saturate(1.2)',
    transform: 'translateX(-50%) translateY(calc(0 * 1%)) scale(0)',
    transition: '0.3s ease',
    willChange: 'filter',
  },
  selectors: {
    '&:hover:before': {
      transform: 'translateX(-50%) translateY(calc(-70 * 1%)) scale(1)',
    },
  },
});

export const updaterButtonStyle = style({});
export const particlesStyle = style({
  background: `var(--svg-animation), var(--svg-animation)`,
  backgroundRepeat: 'no-repeat, repeat',
  backgroundPosition: 'center, center top 100%',
  backgroundSize: '100%, 130%',
  WebkitMaskImage:
    'linear-gradient(to top, transparent, black, black, transparent)',
  width: '100%',
  height: '100%',
  position: 'absolute',
});

export const particlesBefore = style({
  content: '""',
  display: 'block',
  position: 'absolute',
  width: '100%',
  height: '100%',
  background: `var(--svg-animation), var(--svg-animation), var(--svg-animation)`,
  backgroundRepeat: 'no-repeat, repeat, repeat',
  backgroundPosition: 'center, center top 100%, center center',
  backgroundSize: '100% 120%, 150%, 120%',
  filter: 'blur(1px)',
  willChange: 'filter',
});

export const installLabelStyle = style({
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  paddingLeft: '8px',
});
