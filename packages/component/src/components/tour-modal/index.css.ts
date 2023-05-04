import { style } from '@vanilla-extract/css';

export const modalStyle = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  padding: '12px 36px',
  backgroundColor: 'var(--affine-white)',
  borderRadius: '12px',
  boxShadow: 'var(--affine-popover-shadow)',
});
export const titleStyle = style({
  fontSize: 'var(--affine-font-h6)',
  fontWeight: '600',
});
export const videoContainerStyle = style({
  paddingTop: '15px',
  width: '100%',
});
export const videoStyle = style({
  objectFit: 'fill',
  height: '300px',
  width: '100%',
});
export const buttonContainerStyle = style({
  marginTop: '15px',
  width: '100%',
  display: 'flex',
  justifyContent: 'flex-end',
});
export const buttonStyle = style({
  borderRadius: '8px',
  backgroundColor: 'var(--affine-primary-color)',
  color: 'var(--affine-white)',
  height: '32px',
  padding: '4 20px',
  ':hover': {
    backgroundColor: 'var(--affine-primary-color)',
    color: 'var(--affine-text-primary-color)',
  },
});
