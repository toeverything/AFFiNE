import { style } from '@vanilla-extract/css';

export const wrapper = style({
  position: 'relative',
  borderRadius: 8,
  overflow: 'hidden',
  border: `1px solid rgba(125,125,125, 0.3)`,
  cursor: 'pointer',
});

export const input = style({
  position: 'absolute',
  pointerEvents: 'none',
  width: '100%',
  height: '100%',
  top: 0,
  left: 0,
  opacity: 0,
});
