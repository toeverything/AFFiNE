import { style } from '@vanilla-extract/css';

// a sider menu style
export const outlineContainerStyle = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  padding: '0px 4px',
  top: '200px',
  position: 'absolute',
  width: '200px',
  backgroundColor: 'var(--affine-background-color)',
  color: 'var(--affine-text-primary-color)',
});

export const outlineHeaderStyle = style({
  fontWeight: 'bold',
  marginBottom: '20px',
});

export const outlineContentStyle = style({});

export const outlineMenuItemStyle = style({
  cursor: 'pointer',
  padding: '4px',
  display: 'flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  margin: '2px 0',
  textOverflow: 'ellipsis',
  color: 'var(--affine-text-primary-color)',
  ':hover': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  ':active': {
    backgroundColor: 'var(--affine-hover-color)',
  },
  ':focus': {
    backgroundColor: 'var(--affine-hover-color)',
  },
});

export const outlineItemContentStyle = style({
  display: 'inline-block',
  opacity: 0.6,
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});
