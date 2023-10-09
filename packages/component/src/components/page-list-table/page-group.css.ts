import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'flex',
  flexDirection: 'column',
  columnGap: '8px',
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  padding: '0px 16px 0px 4px',
  ':hover': {
    background: '',
  },
});

export const spacer = style({
  flex: 1,
});

export const headerCollapseIcon = style({
  cursor: 'pointer',
});

export const headerLabel = style({
  fontSize: '14px',
  lineHeight: '20px',
  color: '#666',
});

export const headerCount = style({
  fontSize: '12px',
  lineHeight: '16px',
  color: '#999',
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
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
