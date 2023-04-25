import { keyframes, style } from '@vanilla-extract/css';

const slideIn = keyframes({
  '0%': {
    height: '0px',
  },
  '50%': {
    height: '36px',
  },
  '100%': {
    height: '32px',
  },
});
const slideIn2 = keyframes({
  '0%': {
    transform: 'translateX(100%)',
  },
  '50%': {
    transform: 'translateX(100%)',
  },
  '80%': {
    transform: 'translateX(-10%)',
  },
  '100%': {
    transform: 'translateX(0%)',
  },
});

const slideOut = keyframes({
  '0%': {
    height: '32px',
  },
  '60%': {
    height: '32px',
  },
  '80%': {
    height: '32px',
  },
  '100%': {
    height: '0px',
  },
});
const slideOut2 = keyframes({
  '0%': {
    transform: 'translateX(0%)',
  },
  '100%': {
    transform: 'translateX(100%)',
  },
});

export const changeLogWrapperSlideInStyle = style({
  width: 'calc(100% + 4px)',
  height: '0px',
  animation: `${slideIn} 1s ease-in-out forwards`,
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  marginBottom: '4px',
  position: 'relative',
  userSelect: 'none',
  transition: 'all 0.3s',
  overflow: 'hidden',
});
export const changeLogWrapperSlideOutStyle = style({
  animation: `${slideOut} .3s ease-in-out forwards`,
});
export const changeLogSlideInStyle = style({
  width: '110%',
  height: '32px',
  display: 'flex',
  justifyContent: 'flex-start',
  alignItems: 'center',
  color: 'var(--affine-primary-color)',
  backgroundColor: 'var(--affine-tertiary-color)',
  border: '1px solid var(--affine-primary-color)',
  borderRight: 'none',
  marginLeft: '8px',
  paddingLeft: '8px',
  borderRadius: '16px 0 0 16px',
  cursor: 'pointer',
  zIndex: 1001,
  position: 'absolute',
  userSelect: 'none',
  transition: 'all 0.3s',
  animation: `${slideIn2} 1s ease-in-out forwards`,
});
export const changeLogSlideOutStyle = style({
  animation: `${slideOut2} .3s ease-in-out forwards`,
});
export const linkStyle = style({
  flexGrow: 1,
  textAlign: 'left',
  color: 'inherit',
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'flex-start',
  alignItems: 'center',
});
export const iconStyle = style({
  fontSize: '20px',
  marginRight: '12px',
});
export const iconButtonStyle = style({
  fontSize: '20px',
  marginRight: '12%',
  color: 'var(--affine-icon-color)',
});
