import { globalStyle, style } from '@vanilla-extract/css';
export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  position: 'relative',
});
globalStyle(`${root}:hover svg`, {
  opacity: 0.8,
});
globalStyle(`${root}:active svg`, {
  opacity: 0.9,
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
  top: '50%',
  transform: 'translateY(-50%)',
  cursor: 'pointer',
  fontSize: 'inherit',
});
