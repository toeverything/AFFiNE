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

export const body = style({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  width: '100%',
  flexWrap: 'wrap',
  gap: '48px',
  padding: '0 20px',
});

export const leftContainer = style({
  display: 'flex',
  flexDirection: 'column',
  width: '548px',
  gap: '28px',
});
export const leftContentTitle = style({
  fontSize: 'var(--affine-font-title)',
  fontWeight: 700,
  minHeight: '44px',
});
export const leftContentText = style({
  fontSize: 'var(--affine-font-base)',
  fontWeight: 400,
  lineHeight: '1.6',
});

export const mail = style({
  color: 'var(--affine-link-color)',
  textDecoration: 'none',
  ':visited': {
    color: 'var(--affine-link-color)',
  },
});
