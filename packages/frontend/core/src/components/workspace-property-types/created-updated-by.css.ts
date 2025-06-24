import { style } from '@vanilla-extract/css';
export const userWrapper = style({
  display: 'flex',
  gap: '8px',
});

export const userLabelContainer = style({
  height: '100%',
  display: 'flex',
  alignItems: 'center',
});

export const filterValueMenu = style({
  top: 'calc(var(--radix-popper-anchor-height) - 18px) !important',
});
