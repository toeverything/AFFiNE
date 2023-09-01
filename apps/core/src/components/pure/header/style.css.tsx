import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  position: 'relative',
  padding: '0 16px',
  minHeight: '52px',
  background: 'var(--affine-background-primary-color)',
  borderBottom: '1px solid var(--affine-border-color)',
  zIndex: 2,
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
  minWidth: '300px',
  position: 'absolute',
  transform: 'translateX(-50%)',
  left: '50%',
  zIndex: 1,
  selectors: {
    '&.is-window': {
      maxWidth: '50%',
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
      paddingBottom: '10px',
    },
  },
});

export const windowAppControlsWrapper = style({
  display: 'flex',
  marginLeft: '20px',
  // header padding right
  transform: 'translateX(16px)',
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
