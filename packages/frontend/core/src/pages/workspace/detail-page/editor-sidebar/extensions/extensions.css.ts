import { createVar, style } from '@vanilla-extract/css';

export const activeIdx = createVar();

export const switchRoot = style({
  vars: {
    [activeIdx]: '0',
  },
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  height: '32px',
  borderRadius: '12px',
  padding: '4px',
  position: 'relative',
  background: 'var(--affine-background-secondary-color)',

  '::after': {
    content: '""',
    display: 'block',
    width: '24px',
    height: '24px',
    background: 'var(--affine-background-primary-color)',
    boxShadow: 'var(--affine-shadow-1)',
    borderRadius: '8px',
    position: 'absolute',
    transform: `translateX(calc(${activeIdx} * 32px))`,
    transition: 'all .15s',
  },
});

export const button = style({
  width: '24px',
  height: '24px',
  borderRadius: '8px',
  color: 'var(--affine-icon-color)',
  position: 'relative',
  zIndex: 1,

  selectors: {
    '&[data-active=true]': {
      pointerEvents: 'none',
    },
  },
});
