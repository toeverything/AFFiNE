import { style } from '@vanilla-extract/css';

export const root = style({
  height: '100vh',
  width: '100vw',
  display: 'flex',
  flexDirection: 'column',
  fontSize: 'var(--affine-font-base)',
  position: 'relative',
  background: 'var(--affine-background-primary-color)',
});

export const affineLogo = style({
  color: 'inherit',
});

export const topNav = style({
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 120px',
  selectors: {
    '&.mobile': {
      padding: '16px 20px',
    },
  },
});

export const topNavLinks = style({
  display: 'flex',
  columnGap: 4,
});

export const topNavLink = style({
  color: 'var(--affine-text-primary-color)',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 500,
  textDecoration: 'none',
  padding: '4px 18px',
});

export const iconButton = style({
  fontSize: '24px',
  pointerEvents: 'auto',
  selectors: {
    '&.plain': {
      color: 'var(--affine-text-primary-color)',
    },
  },
});

export const menu = style({
  width: '100vw',
  height: '100vh',
  padding: '0',
  background: 'var(--affine-background-primary-color)',
  borderRadius: '0',
  border: 'none',
  boxShadow: 'none',
});

export const menuItem = style({
  color: 'var(--affine-text-primary-color)',
  fontSize: 'var(--affine-font-sm)',
  fontWeight: 500,
  textDecoration: 'none',
  padding: '12px 20px',
  maxWidth: '100%',
  position: 'relative',
  borderRadius: '0',
  transition: 'background 0.3s ease',
  selectors: {
    '&:after': {
      position: 'absolute',
      content: '""',
      bottom: 0,
      display: 'block',
      width: 'calc(100% - 40px)',
      height: '0.5px',
      background: 'var(--affine-black-10)',
    },
    '&:not(:last-of-type)': {
      marginBottom: '0',
    },
  },
});
