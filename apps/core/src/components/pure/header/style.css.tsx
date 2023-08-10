import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

import { headerVanillaContainer } from '../../blocksuite/workspace-header/styles.css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  position: 'relative',
  padding: '0 16px',
  minHeight: '52px',
});

export const headerItem = style({
  height: '32px',
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
  '@container': {
    [`${headerVanillaContainer} (max-width: 900px)`]: {
      height: '50px',
      paddingTop: '0',
    },
  },
} as ComplexStyleRule);
