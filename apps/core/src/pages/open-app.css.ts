import { style } from '@vanilla-extract/css';

export const root = style({
  height: '100vh',
  width: '100vw',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  fontSize: 'var(--affine-font-base)',
  position: 'relative',
});

export const affineLogo = style({
  color: 'inherit',
});

export const topNav = style({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 120px',
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

export const tryAgainLink = style({
  color: 'var(--affine-link-color)',
  fontWeight: 500,
  textDecoration: 'none',
  fontSize: 'var(--affine-font-sm)',
});

export const centerContent = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  marginTop: 40,
});

export const prompt = style({
  marginTop: 20,
  marginBottom: 12,
});
