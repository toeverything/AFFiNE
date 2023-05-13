import { style } from '@vanilla-extract/css';

export const modalStyle = style({
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  backgroundColor: 'var(--affine-background-secondary-color)',
  borderRadius: '16px',
});
export const titleStyle = style({
  fontSize: 'var(--affine-font-h6)',
  fontWeight: '600',
  marginTop: '12px',
});
export const containerStyle = style({
  paddingTop: '25px',
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const videoContainerStyle = style({
  paddingTop: '25px',
  height: '300px',
  width: 'calc(100% - 72px)',
  display: 'flex',
  alignItems: 'center',
  flexGrow: 1,
  justifyContent: 'space-between',
  position: 'relative',
});
export const videoSlideStyle = style({
  width: '100%',
  position: 'absolute',
  top: 0,
  display: 'flex',
  justifyContent: 'center',
});
export const videoStyle = style({
  position: 'absolute',
  objectFit: 'fill',
  height: '300px',
  border: '1px solid var(--affine-border-color)',
  transition: 'opacity 0.5s ease-in-out',
});
export const videoActiveStyle = style({
  opacity: 0,
});
export const arrowStyle = style({
  wordBreak: 'break-all',
  wordWrap: 'break-word',
  width: '36px',
  fontSize: '32px',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  height: '240px',
  flexGrow: 0.2,
  cursor: 'pointer',
});
export const descriptionStyle = style({
  marginTop: '15px',
  width: '100%',
  display: 'flex',
  padding: '0 56px',
  fontSize: 'var(--affine-font-sm)',
  lineHeight: '18px',
  marginBottom: '20px',
});
export const tabStyle = style({
  width: '40px',
  height: '20px',
  content: '""',
  borderBottom: '2px solid var(--affine-text-primary-color)',
  opacity: 0.2,
  margin: '0 10px 20px 0',
  transition: 'all 0.15s ease-in-out',
  ':hover': {
    opacity: 1,
  },
});
export const tabActiveStyle = style({
  opacity: 1,
});
export const tabContainerStyle = style({
  width: '100%',
  marginTop: '20px',
  position: 'relative',
  height: '2px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
});
