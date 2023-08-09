import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

import { headerVanillaContainer } from '../../blocksuite/workspace-header/styles.css';

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  position: 'relative',
  padding: '0 16px',
  height: '52px',
});

export const headerLeft = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexShrink: 0,
});

export const headerCenter = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexGrow: 1,
  // height: '100%',
  // width: '600px',
  // position: 'absolute',
  // left: 0,
  // right: 0,
  // top: 0,
  // margin: 'auto',
});

export const headerRight = style({
  display: 'flex',
  flexShrink: 0,
  justifyContent: 'center',
  alignItems: 'center',
});

export const windowAppControlsWrapper = style({
  display: 'flex',
  gap: '2px',
  transform: 'translateX(8px)',
  height: '100%',
  position: 'absolute',
  right: '14px',
});

export const windowAppControl = style({
  WebkitAppRegion: 'no-drag',
  cursor: 'pointer',
  display: 'inline-flex',
  width: '51px',
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
