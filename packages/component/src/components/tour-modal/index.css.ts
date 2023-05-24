import { keyframes, style } from '@vanilla-extract/css';

export const modalStyle = style({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  backgroundColor: 'var(--affine-background-secondary-color)',
  borderRadius: '16px',
  overflow: 'hidden',
});
export const titleContainerStyle = style({
  width: 'calc(100% - 72px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  height: '60px',
  overflow: 'hidden',
});
export const titleStyle = style({
  fontSize: 'var(--affine-font-h6)',
  fontWeight: '600',
  marginTop: '12px',
  position: 'absolute',
  marginBottom: '12px',
});
const slideToLeft = keyframes({
  '0%': {
    transform: 'translateX(0)',
    opacity: 1,
  },
  '100%': {
    transform: 'translateX(-300px)',
    opacity: 0,
  },
});
const slideToRight = keyframes({
  '0%': {
    transform: 'translateX(0)',
    opacity: 1,
  },
  '100%': {
    transform: 'translateX(300px)',
    opacity: 0,
  },
});
const slideFormLeft = keyframes({
  '0%': {
    transform: 'translateX(300px)',
    opacity: 0,
  },
  '100%': {
    transform: 'translateX(0)',
    opacity: 1,
  },
});
const slideFormRight = keyframes({
  '0%': {
    transform: 'translateX(-300px)',
    opacity: 0,
  },
  '100%': {
    transform: 'translateX(0)',
    opacity: 1,
  },
});
export const formSlideToLeftStyle = style({
  animation: `${slideFormLeft} 0.3s ease-in-out forwards`,
});
export const formSlideToRightStyle = style({
  animation: `${slideFormRight} 0.3s ease-in-out forwards`,
});
export const slideToLeftStyle = style({
  animation: `${slideToLeft} 0.3s ease-in-out forwards`,
});
export const slideToRightStyle = style({
  animation: `${slideToRight} 0.3s ease-in-out forwards`,
});

export const containerStyle = style({
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});
export const videoContainerStyle = style({
  height: '300px',
  width: 'calc(100% - 72px)',
  display: 'flex',
  alignItems: 'center',
  flexGrow: 1,
  justifyContent: 'space-between',
  position: 'relative',
  overflow: 'hidden',
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
const fadeIn = keyframes({
  '0%': {
    transform: 'translateX(300px)',
  },
  '100%': {
    transform: 'translateX(0)',
  },
});
export const videoActiveStyle = style({
  animation: `${fadeIn} 0.5s ease-in-out forwards`,
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
export const descriptionContainerStyle = style({
  width: 'calc(100% - 112px)',
  height: '100px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  position: 'relative',
  overflow: 'hidden',
});

export const descriptionStyle = style({
  marginTop: '15px',
  width: '100%',
  display: 'flex',
  fontSize: 'var(--affine-font-sm)',
  lineHeight: '18px',
  position: 'absolute',
});
export const tabStyle = style({
  width: '40px',
  height: '40px',
  content: '""',
  margin: '40px 10px 40px 0',
  transition: 'all 0.15s ease-in-out',
  position: 'relative',
  cursor: 'pointer',
  ':hover': {
    opacity: 1,
  },
  '::after': {
    content: '""',
    position: 'absolute',
    bottom: '20px',
    left: '0',
    width: '100%',
    height: '2px',
    background: 'var(--affine-text-primary-color)',
    transition: 'all 0.15s ease-in-out',
    opacity: 0.2,
    cursor: 'pointer',
  },
});
export const tabActiveStyle = style({
  '::after': {
    opacity: 1,
  },
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
