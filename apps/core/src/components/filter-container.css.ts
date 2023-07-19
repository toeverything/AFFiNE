import { style } from '@vanilla-extract/css';

export const filterContainerStyle = style({
  padding: '12px',
  display: 'flex',
  position: 'relative',
  '::after': {
    content: '""',
    display: 'block',
    width: '100%',
    height: '1px',
    background: 'var(--affine-border-color)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    margin: '0 1px',
  },
});
