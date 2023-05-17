import { style } from '@vanilla-extract/css';

export const root = style({
  display: 'inline-flex',
  alignItems: 'center',
  borderRadius: '4px',
  width: '100%',
  minHeight: '30px',
  userSelect: 'none',
  cursor: 'pointer',
  padding: '0 8px 0 12px',
  fontSize: 'var(--affine-font-sm)',
  selectors: {
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
    '&[data-active="true"]': {
      background: 'var(--affine-hover-color)',
    },
    '&[data-disabled="true"]': {
      cursor: 'default',
      color: 'var(--affine-text-secondary-color)',
      pointerEvents: 'none',
    },
    '&[data-active="true"]:hover': {
      background:
        // make this a variable?
        'linear-gradient(0deg, rgba(0, 0, 0, 0.04), rgba(0, 0, 0, 0.04)), rgba(0, 0, 0, 0.04);',
    },
    '&[data-collapsible="true"]': {
      width: 'calc(100% + 8px)',
      transform: 'translateX(-8px)',
      paddingLeft: '8px',
    },
  },
});

export const content = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const icon = style({
  color: 'var(--affine-icon-color)',
  fontSize: '20px',
});

export const collapsedIconContainer = style({
  width: '12px',
  height: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '2px',
  transition: 'transform 0.2s',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
    '&:hover': {
      background: 'var(--affine-hover-color)',
    },
  },
});

export const iconsContainer = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '28px',
  selectors: {
    '&[data-collapsible="true"]': {
      width: '40px',
    },
  },
});

export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});

export const spacer = style({
  flex: 1,
});

export const linkItemRoot = style({
  color: 'inherit',
  display: 'contents',
});
