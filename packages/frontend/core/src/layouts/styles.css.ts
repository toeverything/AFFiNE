import { style } from '@vanilla-extract/css';

export const dragOverlay = style({
  display: 'flex',
  alignItems: 'center',
  zIndex: 1001,
  cursor: 'grabbing',
  maxWidth: '360px',
  transition: 'transform 0.2s, opacity 0.2s',
  willChange: 'transform opacity',
  selectors: {
    '&[data-over-drop=true]': {
      transform: 'scale(0.8)',
    },
    '&[data-sorting=true]': {
      opacity: 0,
    },
  },
});
