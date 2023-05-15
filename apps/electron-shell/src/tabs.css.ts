import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  height: '52px',
  position: 'fixed',
  left: '320px',
  top: '6px',
});

export const container = style({
  width: '100%',
  display: 'flex',
  columnGap: '8px',
  flexFlow: 'row nowrap',
  minHeight: '40px',
  alignItems: 'center',
  WebkitAppRegion: 'drag',
} as ComplexStyleRule);

export const tab = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '24px',
  padding: '0 8px',
  gap: '8px',
  borderRadius: '4px',
  cursor: 'pointer',
  userSelect: 'none',
  WebkitAppRegion: 'no-drag',
  selectors: {
    '&:hover': {
      backgroundColor: 'var(--affine-background-tertiary-color)',
    },
    '&[data-active="true"]': {
      backgroundColor: 'var(--affine-background-primary-color)',
    },
  },
} as ComplexStyleRule);

export const closeButton = style({
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  appearance: 'none',
  border: 'none',
  backgroundColor: 'transparent',
  WebkitAppRegion: 'no-drag',
  selectors: {
    '&:hover': {
      backgroundColor: 'var(--affine-background-primary-color)',
    },
  },
} as ComplexStyleRule);

export const plusButton = style({
  width: '16px',
  height: '16px',
  borderRadius: '4px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  appearance: 'none',
  border: 'none',
  backgroundColor: 'transparent',
  WebkitAppRegion: 'no-drag',
  selectors: {
    '&:hover': {
      backgroundColor: 'var(--affine-background-primary-color)',
    },
  },
} as ComplexStyleRule);
