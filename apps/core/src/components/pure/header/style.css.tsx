import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  position: 'relative',
  padding: '0 16px',
  minHeight: '52px',
  borderBottom: '1px solid var(--affine-border-color)',
  selectors: {
    '&[data-sidebar-floating="false"]': {
      WebkitAppRegion: 'drag',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
  ':has([data-popper-placement])': {
    WebkitAppRegion: 'no-drag',
  },
} as ComplexStyleRule);

export const headerItem = style({
  minHeight: '32px',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  selectors: {
    '&.top-item': {
      height: '52px',
    },
    '&.left': {
      justifyContent: 'left',
    },
    '&.right': {
      justifyContent: 'right',
    },
  },
});

export const headerCenter = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '52px',
  flexShrink: 0,
  maxWidth: '60%',
  position: 'absolute',
  transform: 'translateX(-50%)',
  left: '50%',
  zIndex: 1,
  selectors: {
    '&.is-window': {
      maxWidth: '50%',
    },
    '&.is-window.has-min-width': {
      minWidth: '400px',
    },
    '&.shadow': {
      position: 'static',
      visibility: 'hidden',
    },
  },
});

export const headerSideContainer = style({
  display: 'flex',
  flexShrink: 0,
  alignItems: 'center',
  selectors: {
    '&.right': {
      flexDirection: 'row-reverse',
    },
    '&.block': {
      display: 'block',
    },
  },
});

export const windowAppControlsWrapper = style({
  display: 'flex',
  marginLeft: '20px',
});

export const windowAppControl = style({
  WebkitAppRegion: 'no-drag',
  cursor: 'pointer',
  display: 'inline-flex',
  width: '52px',
  height: '52px',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '0',
  selectors: {
    '&[data-type="close"]': {
      width: '56px',
      paddingRight: '5px',
      marginRight: '-12px',
    },
    '&[data-type="close"]:hover': {
      background: 'var(--affine-windows-close-button)',
      color: 'var(--affine-pure-white)',
    },
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
} as ComplexStyleRule);
