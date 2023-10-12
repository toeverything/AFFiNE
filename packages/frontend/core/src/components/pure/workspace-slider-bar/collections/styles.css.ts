import { globalStyle, keyframes, style } from '@vanilla-extract/css';

export const wrapper = style({
  userSelect: 'none',
  // marginLeft:8,
});
export const collapsedIcon = style({
  transition: 'transform 0.2s ease-in-out',
  selectors: {
    '&[data-collapsed="true"]': {
      transform: 'rotate(-90deg)',
    },
  },
});
export const view = style({
  display: 'flex',
  alignItems: 'center',
});
export const viewTitle = style({
  display: 'flex',
  alignItems: 'center',
});
export const title = style({
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
});
export const more = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 2,
  fontSize: 16,
  color: 'var(--affine-icon-color)',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});
export const deleteFolder = style({
  ':hover': {
    color: 'var(--affine-error-color)',
    backgroundColor: 'var(--affine-background-error-color)',
  },
});
globalStyle(`${deleteFolder}:hover svg`, {
  color: 'var(--affine-error-color)',
});
export const menuDividerStyle = style({
  marginTop: '2px',
  marginBottom: '2px',
  marginLeft: '12px',
  marginRight: '8px',
  height: '1px',
  background: 'var(--affine-border-color)',
});

const slideDown = keyframes({
  '0%': {
    height: '0px',
  },
  '100%': {
    height: 'var(--radix-collapsible-content-height)',
  },
});

const slideUp = keyframes({
  '0%': {
    height: 'var(--radix-collapsible-content-height)',
  },
  '100%': {
    height: '0px',
  },
});

export const collapsibleContent = style({
  overflow: 'hidden',
  marginTop: '4px',
  selectors: {
    '&[data-state="open"]': {
      animation: `${slideDown} 0.2s ease-in-out`,
    },
    '&[data-state="closed"]': {
      animation: `${slideUp} 0.2s ease-in-out`,
    },
  },
});
