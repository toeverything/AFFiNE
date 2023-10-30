import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  position: 'relative',
  ':hover': {
    opacity: 0.8,
  },
  ':active': {
    opacity: 0.9,
  },
});

export const disabled = style({
  opacity: 0.5,
  pointerEvents: 'none',
});

export const input = style({
  opacity: 0,
  position: 'absolute',
  width: '1em',
  height: '1em',
  inset: 0,
  cursor: 'pointer',
  fontSize: 'inherit',
});
