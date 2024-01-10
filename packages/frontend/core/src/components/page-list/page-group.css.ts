import { keyframes, style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

const slideDown = keyframes({
  '0%': {
    opacity: 0,
    height: '0px',
  },
  '100%': {
    opacity: 1,
    height: 'var(--radix-collapsible-content-height)',
  },
});

const slideUp = keyframes({
  '0%': {
    opacity: 1,
    height: 'var(--radix-collapsible-content-height)',
  },
  '100%': {
    opacity: 0,
    height: '0px',
  },
});

export const collapsibleContent = style({
  overflow: 'hidden',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDown} 0.3s ease-in-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUp} 0.3s ease-in-out`,
    },
  },
});

export const collapsibleContentInner = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0px 16px 0px 6px',
  gap: 4,
  height: '28px',
  background: 'var(--affine-background-primary-color)',
  ':hover': {
    background: 'var(--affine-hover-color-filled)',
  },
  userSelect: 'none',
});

export const spacer = style({
  flex: 1,
});

export const headerCollapseIcon = style({
  cursor: 'pointer',
});

export const headerLabel = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-secondary-color)',
});

export const headerCount = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-disable-color)',
});

export const selectAllButton = style({
  display: 'flex',
  opacity: 0,
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontSize: 'var(--affine-font-xs)',
  height: '20px',
  borderRadius: 4,
  padding: '0 8px',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    [`${header}:hover &`]: {
      opacity: 1,
    },
  },
});

export const collapsedIcon = style({
  opacity: 0,
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="false"]': {
      transform: 'rotate(90deg)',
    },
    [`${header}:hover &, &[data-collapsed="true"]`]: {
      opacity: 1,
    },
  },
});

export const collapsedIconContainer = style({
  width: '16px',
  height: '16px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  color: 'inherit',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    '&[data-disabled="true"]': {
      opacity: 0.3,
      pointerEvents: 'none',
    },
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});
