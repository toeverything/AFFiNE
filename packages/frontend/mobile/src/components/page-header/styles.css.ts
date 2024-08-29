import { style } from '@vanilla-extract/css';

export const root = style({
  width: '100%',
  minHeight: 44,
  padding: '0 6px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  position: 'relative',
});
export const content = style({
  selectors: {
    '&.center': {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
    },
    '&:not(.center)': {
      width: 0,
      flex: 1,
    },
  },
});
export const spacer = style({
  width: 0,
  flex: 1,
});
export const prefix = style({
  display: 'flex',
  alignItems: 'center',
  gap: 0,
});
export const suffix = style({
  display: 'flex',
  alignItems: 'center',
  gap: 18,
});
