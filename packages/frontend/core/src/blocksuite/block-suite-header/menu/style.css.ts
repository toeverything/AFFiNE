import { style } from '@vanilla-extract/css';
export const shareMenu = style({
  padding: 4,
  width: '420px',
  // to handle overflow when the width is not enough
  maxWidth: 'calc(var(--radix-dropdown-menu-content-available-width) - 8px)',
});
