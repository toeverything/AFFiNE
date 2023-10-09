import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  rowGap: '8px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0px 16px 0px 4px',
  height: '28px',
  ':hover': {
    background: 'var(--affine-hover-color)',
  },
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
  marginLeft: '8px',
});

export const collapsedIcon = style({
  display: 'none',
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    [`${header}:hover &`]: {
      display: 'block',
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
