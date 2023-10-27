import { keyframes, style } from '@vanilla-extract/css';

const slideDownAndFade = keyframes({
  '0%': {
    opacity: 0,
    transform: 'scale(0.95) translateY(20px)',
  },
  '100%': {
    opacity: 1,
    transform: 'scale(1) translateY(0)',
  },
});

const slideUpAndFade = keyframes({
  '0%': {
    opacity: 1,
    transform: 'scale(1) translateY(0)',
  },
  '100%': {
    opacity: 0,
    transform: 'scale(0.95) translateY(20px)',
  },
});

export const root = style({
  display: 'flex',
  alignItems: 'center',
  borderRadius: '10px',
  padding: '4px',
  border: '1px solid var(--affine-border-color)',
  boxShadow: 'var(--affine-menu-shadow)',
  gap: 4,
  minWidth: 'max-content',
  width: 'fit-content',
  background: 'var(--affine-background-primary-color)',
});

export const popoverContent = style({
  willChange: 'transform opacity',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDownAndFade} 0.2s ease-in-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUpAndFade} 0.2s ease-in-out`,
    },
  },
});

export const separator = style({
  width: '1px',
  height: '24px',
  background: 'var(--affine-divider-color)',
});

export const item = style({
  display: 'flex',
  alignItems: 'center',
  color: 'inherit',
  gap: 4,
  height: '32px',
  padding: '0 6px',
});

export const button = style([
  item,
  {
    borderRadius: '8px',
    ':hover': {
      background: 'var(--affine-hover-color)',
    },
  },
]);

export const danger = style({
  color: 'inherit',
  ':hover': {
    background: 'var(--affine-background-error-color)',
    color: 'var(--affine-error-color)',
  },
});

export const buttonIcon = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 20,
  color: 'var(--affine-icon-color)',
  selectors: {
    [`${danger}:hover &`]: {
      color: 'var(--affine-error-color)',
    },
  },
});
