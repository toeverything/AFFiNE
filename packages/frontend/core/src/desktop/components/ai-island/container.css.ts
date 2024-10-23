import { style } from '@vanilla-extract/css';

export const islandContainer = style({
  position: 'absolute',
  right: 16,
  bottom: 16,
  zIndex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  selectors: {
    '&.trash': {
      bottom: '78px',
    },
  },
});
