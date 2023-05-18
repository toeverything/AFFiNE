import { style } from '@vanilla-extract/css';

export const label = style({
  selectors: {
    '&[data-untitled="true"]': {
      opacity: 0.6,
    },
  },
});

export const favItemWrapper = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  selectors: {
    '&[data-nested="true"]': {
      marginLeft: '12px',
      width: 'calc(100% - 12px)',
    },
  },
});
