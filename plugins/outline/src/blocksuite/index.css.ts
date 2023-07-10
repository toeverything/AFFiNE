import { style } from '@vanilla-extract/css';

// a sider menu style
export const outlineContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  top: '20px',
  position: 'absolute',
  width: '200px',
  backgroundColor: 'var(--affine-background-color)',
  color: 'var(--affine-text-primary-color)',
});

export const outlineHeaderStyle = style({});

export const outlineContentStyle = style({});

export const outlineMenuItemStyle = style({
  cursor: 'pointer',
  padding: '4px 8px',
  ':hover': {
    backgroundColor: 'var(--affine-background-color-hover)',
  },
  ':active': {
    backgroundColor: 'var(--affine-background-color-active)',
  },
  ':focus': {
    backgroundColor: 'var(--affine-background-color-active)',
  },
});
