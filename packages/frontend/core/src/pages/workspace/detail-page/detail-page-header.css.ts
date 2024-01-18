import type { ComplexStyleRule } from '@vanilla-extract/css';
import { style } from '@vanilla-extract/css';

export const header = style({
  display: 'flex',
  height: '52px',
  width: '100%',
  alignItems: 'center',
  flexShrink: 0,
  background: 'var(--affine-background-primary-color)',
  borderBottom: '1px solid var(--affine-border-color)',
  selectors: {
    '&[data-sidebar-floating="false"]': {
      WebkitAppRegion: 'drag',
    },
  },
  '@media': {
    print: {
      display: 'none',
    },
  },
  ':has([data-popper-placement])': {
    WebkitAppRegion: 'no-drag',
  },
} as ComplexStyleRule);

export const mainHeader = style([
  header,
  {
    padding: '0 16px',
    gap: 12,
  },
]);

export const sidebarHeader = style([
  header,
  {
    padding: '0 14px',
    gap: '12px',
  },
]);

export const mainHeaderRight = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
});

export const spacer = style({
  flexGrow: 1,
  minWidth: 12,
});

export const standaloneExtensionSwitcherWrapper = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  height: '52px',
  position: 'relative',
});

export const journalWeekPicker = style({
  minWidth: 100,
  flexGrow: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
