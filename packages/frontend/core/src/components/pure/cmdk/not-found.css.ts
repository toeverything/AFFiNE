import { style } from '@vanilla-extract/css';

export const notFoundContainer = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '0 8px',
  marginBottom: 8,
});

export const notFoundItem = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  padding: '0 12px',
  gap: 16,
});

export const notFoundIcon = style({
  display: 'flex',
  alignItems: 'center',
  fontSize: 20,
  color: 'var(--affine-icon-secondary)',
  padding: '12px 0',
});

export const notFoundTitle = style({
  fontSize: 'var(--affine-font-xs)',
  color: 'var(--affine-text-secondary-color)',
  fontWeight: '600',
  lineHeight: '20px',
  textAlign: 'justify',
  padding: '8px',
});

export const notFoundText = style({
  fontSize: 'var(--affine-font-sm)',
  color: 'var(--affine-text-primary-color)',
  lineHeight: '22px',
  fontWeight: '400',
});
